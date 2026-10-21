import uuid
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.booking import repository as repo
from app.booking.slots import SlotQuery, at_minute, day_intervals, free_slots
from app.catalog import CatalogService
from app.domain.enums import BookingActor, BookingEventType, BookingStatus
from app.domain.errors import (
    BookingNotActive,
    BookingNotFound,
    FieldError,
    NotOwner,
    SlotTaken,
    TooLateToChange,
    ValidationFailed,
    VersionConflict,
)
from app.models import Booking, BookingSettings, Resource
from app.services import ratelimit
from app.services.phone import normalize_phone
from app.settings import Settings

REMINDERS = (
    ("booking_reminder_24h", "reminder_24h", timedelta(hours=24)),
    ("booking_reminder_2h", "reminder_2h", timedelta(hours=2)),
)
MAX_DAYS_RANGE = 31
ANY_RESOURCE_RETRIES = 3
PAGE_SIZE = 20

Clock = Callable[[], datetime]


def _utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class BookableService:
    """Услуга, доступная для записи: длительность гарантированно задана."""

    slug: str
    title: str
    price_from: int | None
    duration_min: int
    buffer_min: int


@dataclass(frozen=True)
class Client:
    name: str
    phone: str  # как ввёл пользователь; нормализуется сервисом
    phone_source: str  # max_contact | manual | admin
    max_user_id: int | None = None
    comment: str | None = None


@dataclass(frozen=True)
class NewBooking:
    service_slug: str
    resource_id: uuid.UUID | None  # None = любой специалист
    starts_at: datetime
    client: Client
    source: str  # max | admin
    policy_version: str | None = None
    ip_hash: bytes = b""
    user_agent: str = ""
    idempotency_key: str | None = None
    ignore_lead_time: bool = False
    notify_client: bool = True
    actor_user_id: uuid.UUID | None = None


@dataclass(frozen=True)
class Slot:
    starts_at: datetime
    ends_at: datetime  # без буфера: его клиент не видит
    resource_ids: tuple[uuid.UUID, ...] = field(default=(), compare=False)


@dataclass(frozen=True)
class BookingResult:
    booking: Booking
    resource: Resource
    created: bool


class BookingService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings: Settings,
        *,
        catalog: Mapping[str, CatalogService],
        consent_text_sha256: bytes,
        clock: Clock = _utcnow,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._settings = settings
        self._catalog = catalog
        self._consent_sha = consent_text_sha256
        self._clock = clock
        self.tz = ZoneInfo(settings.business_timezone)

    # ---------- свободное время ----------

    def bookable(self, service_slug: str) -> BookableService:
        service = self._catalog.get(service_slug)
        if service is None or not service.bookable or service.duration_min is None:
            raise ValidationFailed([FieldError("service_slug", "service_not_bookable")])
        return BookableService(
            slug=service.slug,
            title=service.title,
            price_from=service.price_from,
            duration_min=service.duration_min,
            buffer_min=service.buffer_min,
        )

    async def slots(
        self,
        service_slug: str,
        resource_id: uuid.UUID | None,
        day: date,
        *,
        ignore_lead_time: bool = False,
    ) -> list[Slot]:
        service = self.bookable(service_slug)
        async with self._sessionmaker() as session:
            return await self._day_slots(session, service, resource_id, day, ignore_lead_time)

    async def available_days(
        self, service_slug: str, resource_id: uuid.UUID | None, first: date, last: date
    ) -> list[tuple[date, bool]]:
        service = self.bookable(service_slug)
        if last < first or (last - first).days >= MAX_DAYS_RANGE:
            raise ValidationFailed([FieldError("to", "slot_out_of_range")])
        async with self._sessionmaker() as session:
            resources = await self._candidates(session, service, resource_id)
            settings = await repo.get_settings(session)
            per_day = await self._compute(session, service, resources, first, last, settings, False)
        return [(day, any(per_day[day].values())) for day in sorted(per_day)]

    async def _candidates(
        self, session: AsyncSession, service: BookableService, resource_id: uuid.UUID | None
    ) -> list[Resource]:
        resources = await repo.resources_for_service(session, service.slug, resource_id)
        if resource_id is not None and not resources:
            raise ValidationFailed([FieldError("resource_id", "resource_not_available")])
        return resources

    async def _day_slots(
        self,
        session: AsyncSession,
        service: BookableService,
        resource_id: uuid.UUID | None,
        day: date,
        ignore_lead_time: bool,
    ) -> list[Slot]:
        resources = await self._candidates(session, service, resource_id)
        settings = await repo.get_settings(session)
        per_day = await self._compute(
            session, service, resources, day, day, settings, ignore_lead_time
        )
        return self._merge(service, per_day[day])

    @staticmethod
    def _merge(
        service: BookableService, per_resource: Mapping[uuid.UUID, list[datetime]]
    ) -> list[Slot]:
        by_start: dict[datetime, list[uuid.UUID]] = {}
        for rid, starts in per_resource.items():
            for start in starts:
                by_start.setdefault(start, []).append(rid)
        duration = timedelta(minutes=service.duration_min)
        return [Slot(s, s + duration, tuple(r)) for s, r in sorted(by_start.items())]

    async def _compute(
        self,
        session: AsyncSession,
        service: BookableService,
        resources: list[Resource],
        first: date,
        last: date,
        settings: BookingSettings,
        ignore_lead_time: bool,
    ) -> dict[date, dict[uuid.UUID, list[datetime]]]:
        """Свободные старты по дням диапазона и ресурсам; данные читаются тремя запросами."""
        days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
        result: dict[date, dict[uuid.UUID, list[datetime]]] = {d: {} for d in days}
        if not resources:
            return result
        ids = [r.id for r in resources]
        weekly = await repo.load_weekly(session, ids)
        exceptions = await repo.load_exceptions(session, ids, first, last)
        busy = await repo.load_busy(
            session, ids, at_minute(first, 0, self.tz), at_minute(last, 1440, self.tz)
        )
        now = self._clock()
        for day in days:
            query = SlotQuery(
                day=day,
                tz=self.tz,
                now=now,
                duration=timedelta(minutes=service.duration_min),
                buffer=timedelta(minutes=service.buffer_min),
                step=timedelta(minutes=settings.slot_step_min),
                min_lead=timedelta(0)
                if ignore_lead_time
                else timedelta(minutes=settings.min_lead_min),
                horizon_end=now + timedelta(days=settings.horizon_days),
            )
            for rid in ids:
                kind, intervals = exceptions[rid].get(day, (None, []))
                work = day_intervals(day, weekly[rid], kind, intervals)
                result[day][rid] = free_slots(query, work, busy.get(rid, []))
        return result

    # ---------- создание ----------

    async def create(self, cmd: NewBooking) -> BookingResult:
        service = self.bookable(cmd.service_slug)
        phone = normalize_phone(cmd.client.phone)
        errors: list[FieldError] = []
        if phone is None:
            errors.append(FieldError("phone", "phone_invalid"))
        if cmd.source == "max" and cmd.policy_version != self._settings.privacy_policy_version:
            errors.append(FieldError("consent", "consent_required"))
        if errors or phone is None:
            raise ValidationFailed(errors)
        phone_e164: str = phone

        user_id = cmd.client.max_user_id
        if user_id is not None and cmd.source == "max":
            await ratelimit.enforce(
                self._sessionmaker, f"booking:{user_id}", self._settings.rate_limit_booking
            )
        if user_id is not None and cmd.idempotency_key:
            async with self._sessionmaker() as session:
                if (
                    existing := await self._by_key(session, user_id, cmd.idempotency_key)
                ) is not None:
                    return existing

        async def attempt(session: AsyncSession) -> BookingResult:
            now = self._clock()
            consent_id = None
            if cmd.source == "max":
                consent = await repo.add_consent(
                    session,
                    policy_version=cmd.policy_version or "",
                    consent_text_sha256=self._consent_sha,
                    ip_hash=cmd.ip_hash,
                    user_agent=cmd.user_agent,
                )
                consent_id = consent.id
            booking, resource = await self._insert(
                session,
                service=service,
                resource_id=cmd.resource_id,
                starts_at=cmd.starts_at,
                now=now,
                ignore_lead_time=cmd.ignore_lead_time,
                client=cmd.client,
                phone=phone_e164,
                source=cmd.source,
                consent_id=consent_id,
                idempotency_key=cmd.idempotency_key,
                rescheduled_from=None,
                actor=BookingActor.ADMIN if cmd.source == "admin" else BookingActor.CLIENT,
                actor_user_id=cmd.actor_user_id,
                notify_client=cmd.notify_client,
            )
            return BookingResult(booking, resource, created=True)

        try:
            return await self._run(
                service, cmd.resource_id, cmd.starts_at, cmd.ignore_lead_time, attempt
            )
        except (_IdempotencyRace, SlotTaken) as race:
            return await self._existing_after_race(user_id, cmd.idempotency_key, race)

    async def _existing_after_race(
        self, max_user_id: int | None, key: str | None, race: Exception
    ) -> BookingResult:
        if max_user_id is None or not key:
            raise race
        async with self._sessionmaker() as session:
            existing = await self._by_key(session, max_user_id, key)
        if existing is None:
            raise race
        return existing

    async def _by_key(
        self, session: AsyncSession, max_user_id: int, key: str
    ) -> BookingResult | None:
        booking = await repo.booking_by_key(session, max_user_id, key)
        if booking is None:
            return None
        return BookingResult(booking, await repo.get_resource(session, booking.resource_id), False)

    async def _run(
        self,
        service: BookableService,
        resource_id: uuid.UUID | None,
        starts_at: datetime,
        ignore_lead_time: bool,
        attempt: Callable[[AsyncSession], Awaitable[BookingResult]],
    ) -> BookingResult:
        """Транзакция записи; гонку за время превращает в 409 с обновлённым списком времени.

        «Любой специалист»: если два запроса выбрали одного сотрудника, проигравший
        повторяет выбор — теперь первый уже занят, и достанется другой.
        """
        for retry in range(ANY_RESOURCE_RETRIES):
            try:
                async with self._sessionmaker() as session, session.begin():
                    return await attempt(session)
            except SlotTaken as exc:
                exc.extra = {
                    "slots": await self._refreshed(
                        service, resource_id, starts_at, ignore_lead_time
                    )
                }
                raise
            except DBAPIError as exc:
                code = getattr(exc.orig, "sqlstate", None)
                if code == repo.EXCLUSION_VIOLATION:
                    if resource_id is None and retry < ANY_RESOURCE_RETRIES - 1:
                        continue
                    refreshed = await self._refreshed(
                        service, resource_id, starts_at, ignore_lead_time
                    )
                    raise SlotTaken(extra={"slots": refreshed}) from exc
                if code == repo.UNIQUE_VIOLATION and "idempotency_key" in str(exc.orig):
                    raise _IdempotencyRace from exc
                raise
        raise SlotTaken  # недостижимо: последняя попытка всегда возвращает или бросает

    async def _refreshed(
        self,
        service: BookableService,
        resource_id: uuid.UUID | None,
        starts_at: datetime,
        ignore_lead_time: bool,
    ) -> list[dict[str, str]]:
        day = starts_at.astimezone(self.tz).date()
        async with self._sessionmaker() as session:
            try:
                slots = await self._day_slots(session, service, resource_id, day, ignore_lead_time)
            except ValidationFailed:
                return []
        return [
            {"starts_at": s.starts_at.isoformat(), "ends_at": s.ends_at.isoformat()} for s in slots
        ]

    async def _insert(
        self,
        session: AsyncSession,
        *,
        service: BookableService,
        resource_id: uuid.UUID | None,
        starts_at: datetime,
        now: datetime,
        ignore_lead_time: bool,
        client: Client,
        phone: str,
        source: str,
        consent_id: uuid.UUID | None,
        idempotency_key: str | None,
        rescheduled_from: Booking | None,
        actor: BookingActor,
        actor_user_id: uuid.UUID | None,
        notify_client: bool,
    ) -> tuple[Booking, Resource]:
        starts_at = starts_at.astimezone(UTC)
        settings = await repo.get_settings(session)
        lead = timedelta(0) if ignore_lead_time else timedelta(minutes=settings.min_lead_min)
        if starts_at < now + lead or starts_at >= now + timedelta(days=settings.horizon_days):
            raise ValidationFailed([FieldError("starts_at", "slot_out_of_range")])

        resources = await self._candidates(session, service, resource_id)
        day = starts_at.astimezone(self.tz).date()
        free = (
            await self._compute(session, service, resources, day, day, settings, ignore_lead_time)
        )[day]
        suitable = [r for r in resources if starts_at in set(free[r.id])]
        if not suitable:
            raise SlotTaken
        resource = await self._pick(session, suitable, day)

        ends_at = starts_at + timedelta(minutes=service.duration_min)
        booking = await repo.add_booking(
            session,
            resource_id=resource.id,
            service_slug=service.slug,
            service_title_snapshot=service.title,
            duration_min=service.duration_min,
            buffer_min=service.buffer_min,
            price_from_snapshot=service.price_from,
            starts_at=starts_at,
            ends_at=ends_at,
            blocked=Range(starts_at, ends_at + timedelta(minutes=service.buffer_min), bounds="[)"),
            client_name=client.name,
            client_phone_e164=phone,
            phone_source=client.phone_source,
            max_user_id=client.max_user_id,
            source=source,
            comment=client.comment or None,
            consent_id=consent_id,
            idempotency_key=idempotency_key,
            rescheduled_from_id=rescheduled_from.id if rescheduled_from else None,
        )
        payload: dict[str, object] = {}
        if rescheduled_from is not None:
            payload["rescheduled_from"] = str(rescheduled_from.id)
        await repo.add_event(
            session,
            booking_id=booking.id,
            type_=BookingEventType.CREATED,
            actor=actor,
            actor_user_id=actor_user_id,
            payload=payload,
        )
        await self._notify_created(
            session, booking, settings, now, notify_client, rescheduled=rescheduled_from is not None
        )
        return booking, resource

    async def _pick(self, session: AsyncSession, suitable: list[Resource], day: date) -> Resource:
        """Меньше всего записей за день; при равенстве — первый по sort_order."""
        if len(suitable) == 1:
            return suitable[0]
        counts = await repo.count_confirmed(
            session,
            [r.id for r in suitable],
            at_minute(day, 0, self.tz),
            at_minute(day, 1440, self.tz),
        )
        return min(suitable, key=lambda r: counts.get(r.id, 0))

    async def _notify_created(
        self,
        session: AsyncSession,
        booking: Booking,
        settings: BookingSettings,
        now: datetime,
        notify_client: bool,
        *,
        rescheduled: bool,
    ) -> None:
        payload = {"booking_id": str(booking.id)}
        for channel in self._settings.enabled_channels:
            await repo.add_outbox(
                session, kind="booking_created_owner", channel=channel, payload=payload
            )
        if booking.max_user_id is None or not notify_client:
            return
        client_kind = "booking_rescheduled_client" if rescheduled else "booking_confirmed_client"
        await repo.add_outbox(session, kind=client_kind, channel="max_user", payload=payload)
        if not settings.reminders_enabled:
            return
        for kind, key, before in REMINDERS:
            due = booking.starts_at - before
            if due > now:
                await repo.add_outbox(
                    session,
                    kind=kind,
                    channel="max_user",
                    payload=payload,
                    next_attempt_at=due,
                    dedupe_key=f"{key}:{booking.id}",
                )

    # ---------- чтение ----------

    async def get(self, booking_id: uuid.UUID, max_user_id: int) -> BookingResult:
        async with self._sessionmaker() as session:
            booking = await repo.get_booking(session, booking_id)
            if booking is None:
                raise BookingNotFound
            if booking.max_user_id != max_user_id:
                raise NotOwner
            return BookingResult(
                booking, await repo.get_resource(session, booking.resource_id), False
            )

    async def list_for_user(
        self, max_user_id: int, *, upcoming: bool, page: int
    ) -> tuple[list[BookingResult], int]:
        async with self._sessionmaker() as session:
            bookings, total = await repo.list_for_user(
                session,
                max_user_id,
                upcoming=upcoming,
                now=self._clock(),
                limit=PAGE_SIZE,
                offset=(max(page, 1) - 1) * PAGE_SIZE,
            )
            resources = {
                rid: await repo.get_resource(session, rid)
                for rid in {b.resource_id for b in bookings}
            }
        return [BookingResult(b, resources[b.resource_id], False) for b in bookings], total

    async def policy(self) -> BookingSettings:
        async with self._sessionmaker() as session:
            return await repo.get_settings(session)

    async def active_resources(self) -> list[tuple[Resource, list[str]]]:
        """Активные ресурсы и их услуги, доступные для записи."""
        async with self._sessionmaker() as session:
            rows = await repo.active_resources(session)
        bookable = {slug for slug, item in self._catalog.items() if item.bookable}
        return [(r, [s for s in slugs if s in bookable]) for r, slugs in rows]

    def now(self) -> datetime:
        return self._clock()

    def change_deadline(self, booking: Booking, settings: BookingSettings) -> datetime:
        return booking.starts_at - timedelta(minutes=settings.cancel_deadline_min)

    async def can_change(self, booking: Booking) -> tuple[bool, datetime]:
        async with self._sessionmaker() as session:
            settings = await repo.get_settings(session)
        deadline = self.change_deadline(booking, settings)
        return booking.status == BookingStatus.CONFIRMED and self._clock() <= deadline, deadline

    # ---------- отмена и перенос клиентом ----------

    async def _lock_own(
        self, session: AsyncSession, booking_id: uuid.UUID, max_user_id: int, version: int
    ) -> tuple[Booking, BookingSettings]:
        booking = await repo.get_booking(session, booking_id, for_update=True)
        if booking is None:
            raise BookingNotFound
        if booking.max_user_id != max_user_id:
            raise NotOwner
        if booking.status != BookingStatus.CONFIRMED:
            raise BookingNotActive
        if booking.version != version:
            raise VersionConflict("Запись уже изменили")
        settings = await repo.get_settings(session)
        if self._clock() > self.change_deadline(booking, settings):
            raise TooLateToChange
        return booking, settings

    async def cancel(self, booking_id: uuid.UUID, max_user_id: int, version: int) -> BookingResult:
        async with self._sessionmaker() as session, session.begin():
            booking, _ = await self._lock_own(session, booking_id, max_user_id, version)
            now = self._clock()
            await repo.set_status(session, booking, BookingStatus.CANCELLED_BY_CLIENT, now=now)
            await repo.cancel_pending_outbox(session, booking.id)
            await repo.add_event(
                session,
                booking_id=booking.id,
                type_=BookingEventType.CANCELLED,
                actor=BookingActor.CLIENT,
                payload={},
            )
            for channel in self._settings.enabled_channels:
                await repo.add_outbox(
                    session,
                    kind="booking_cancelled_owner",
                    channel=channel,
                    payload={"booking_id": str(booking.id)},
                )
            resource = await repo.get_resource(session, booking.resource_id)
            return BookingResult(booking, resource, False)

    async def reschedule(
        self,
        booking_id: uuid.UUID,
        max_user_id: int,
        *,
        starts_at: datetime,
        resource_id: uuid.UUID | None,
        version: int,
        idempotency_key: str | None = None,
    ) -> BookingResult:
        if idempotency_key:
            async with self._sessionmaker() as session:
                if (
                    existing := await self._by_key(session, max_user_id, idempotency_key)
                ) is not None:
                    return existing
        async with self._sessionmaker() as session:
            old_snapshot = await repo.get_booking(session, booking_id)
        if old_snapshot is None:
            raise BookingNotFound
        service = self.bookable(old_snapshot.service_slug)

        async def attempt(session: AsyncSession) -> BookingResult:
            old, _ = await self._lock_own(session, booking_id, max_user_id, version)
            now = self._clock()
            # сначала освобождаем время старой записи: так можно сдвинуться на соседнее время
            await repo.set_status(session, old, BookingStatus.RESCHEDULED, now=now)
            await repo.cancel_pending_outbox(session, old.id)
            booking, resource = await self._insert(
                session,
                service=service,
                resource_id=resource_id,
                starts_at=starts_at,
                now=now,
                ignore_lead_time=False,
                client=Client(
                    name=old.client_name,
                    phone=old.client_phone_e164,
                    phone_source=old.phone_source,
                    max_user_id=old.max_user_id,
                    comment=old.comment,
                ),
                phone=old.client_phone_e164,
                source=old.source,
                consent_id=old.consent_id,
                idempotency_key=idempotency_key,
                rescheduled_from=old,
                actor=BookingActor.CLIENT,
                actor_user_id=None,
                notify_client=True,
            )
            await repo.add_event(
                session,
                booking_id=old.id,
                type_=BookingEventType.RESCHEDULED,
                actor=BookingActor.CLIENT,
                payload={"to": str(booking.id)},
            )
            return BookingResult(booking, resource, created=True)

        try:
            return await self._run(service, resource_id, starts_at, False, attempt)
        except (_IdempotencyRace, SlotTaken) as race:
            return await self._existing_after_race(max_user_id, idempotency_key, race)


class _IdempotencyRace(Exception):
    """Параллельный запрос с тем же Idempotency-Key уже создал запись."""
