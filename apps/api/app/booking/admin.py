"""Администрирование записи: список и календарь, статусы, сотрудники, график, настройки."""

import uuid
from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.booking import admin_repo as arepo
from app.booking import repository as repo
from app.booking.service import BookingResult, BookingService, Client, NewBooking, Slot
from app.booking.slots import MINUTES_PER_DAY, Interval, at_minute, day_intervals
from app.catalog import CatalogService
from app.domain.enums import BookingActor, BookingEventType, BookingStatus
from app.domain.errors import (
    BookingNotActive,
    BookingNotFound,
    ConflictsWithBookings,
    FieldError,
    HasFutureBookings,
    NotFound,
    ValidationFailed,
    VersionConflict,
)
from app.models import (
    Booking,
    BookingEvent,
    BookingSettings,
    Resource,
    ScheduleException,
)
from app.schemas.admin_booking import (
    AdminBookingCreate,
    AdminBookingDetail,
    AdminBookingOut,
    AdminBookingPage,
    AdminReschedule,
    BookingSettingsOut,
    BookingSettingsPatch,
    CalendarOut,
    ExceptionCreate,
    ExceptionOut,
    ResourceAdminOut,
    ResourceCreate,
    ResourcePatch,
    SlotAdminOut,
    SlotsAdminOut,
    WorkingHoursOut,
)
from app.schemas.admin_leads import ActorOut, EventOut
from app.schemas.max_app import ResourceRef, ServiceRef
from app.security.sessions import AdminIdentity
from app.settings import Settings

MAX_RANGE_DAYS = 62
SCHEDULE_CHANGE_REASON = "Изменение графика"
Clock = Callable[[], datetime]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def booking_out(booking: Booking, resource: Resource) -> AdminBookingOut:
    return AdminBookingOut(
        id=booking.id,
        public_number=booking.public_number,
        status=booking.status,
        service=ServiceRef(slug=booking.service_slug, title=booking.service_title_snapshot),
        resource=ResourceRef(id=resource.id, name=resource.name, title=resource.title),
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        client_name=booking.client_name,
        client_phone_e164=booking.client_phone_e164,
        comment=booking.comment,
        source=booking.source,
        phone_source=booking.phone_source,
        has_max=booking.max_user_id is not None,
        cancel_reason=booking.cancel_reason,
        rescheduled_from_id=booking.rescheduled_from_id,
        anonymized_at=booking.anonymized_at,
        version=booking.version,
        created_at=booking.created_at,
    )


def event_out(event: BookingEvent, actor_email: tuple[uuid.UUID, str] | None) -> EventOut:
    return EventOut(
        id=event.id,
        type=event.type,
        actor=ActorOut(id=actor_email[0], email=actor_email[1]) if actor_email else None,
        payload=event.payload,
        created_at=event.created_at,
    )


def resource_out(resource: Resource, slugs: Sequence[str]) -> ResourceAdminOut:
    return ResourceAdminOut(
        id=resource.id,
        name=resource.name,
        title=resource.title,
        is_active=resource.is_active,
        sort_order=resource.sort_order,
        service_slugs=list(slugs),
    )


def settings_out(row: BookingSettings) -> BookingSettingsOut:
    return BookingSettingsOut(
        slot_step_min=row.slot_step_min,
        min_lead_min=row.min_lead_min,
        horizon_days=row.horizon_days,
        cancel_deadline_min=row.cancel_deadline_min,
        reminders_enabled=row.reminders_enabled,
        version=row.version,
    )


def validate_intervals(intervals: Sequence[Interval], field: str) -> list[Interval]:
    """Интервалы дня: внутри суток, начало раньше конца, без пересечений. Касание допустимо."""
    ordered = sorted(intervals)
    previous_end = 0
    for start, end in ordered:
        if not 0 <= start < end <= MINUTES_PER_DAY:
            raise ValidationFailed([FieldError(field, "invalid_interval")])
        if start < previous_end:
            raise ValidationFailed([FieldError(field, "intervals_overlap")])
        previous_end = end
    return ordered


class BookingAdminService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings: Settings,
        *,
        bookings: BookingService,
        catalog: Mapping[str, CatalogService],
        clock: Clock = _utcnow,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._settings = settings
        self._bookings = bookings
        self._catalog = catalog
        self._clock = clock
        self.tz = ZoneInfo(settings.business_timezone)

    def today(self) -> date:
        return self._clock().astimezone(self.tz).date()

    def _day_bounds(self, first: date, last: date) -> tuple[datetime, datetime]:
        return at_minute(first, 0, self.tz), at_minute(last, MINUTES_PER_DAY, self.tz)

    # ---------- чтение ----------

    async def search(
        self,
        *,
        date_from: date | None,
        date_to: date | None,
        resource_id: uuid.UUID | None,
        status: BookingStatus | None,
        q: str | None,
        page: int,
        page_size: int,
    ) -> AdminBookingPage:
        first = date_from or self.today()
        last = date_to or first + timedelta(days=MAX_RANGE_DAYS - 1)
        if last < first or (last - first).days >= MAX_RANGE_DAYS:
            raise ValidationFailed([FieldError("date_to", "range_too_long")])
        start, end = self._day_bounds(first, last)
        async with self._sessionmaker() as session:
            rows, total = await arepo.list_bookings(
                session,
                start=start,
                end=end,
                resource_id=resource_id,
                status=status,
                q=q,
                page=page,
                page_size=page_size,
            )
        return AdminBookingPage(
            items=[booking_out(b, r) for b, r in rows],
            page=page,
            page_size=page_size,
            total=total,
        )

    async def calendar(self, day: date) -> CalendarOut:
        start, end = self._day_bounds(day, day)
        async with self._sessionmaker() as session:
            rows = await arepo.day_bookings(session, start, end)
            resources = await arepo.resources_with_services(session)
            busy_ids = {r.id for _, r in rows}
            shown = [(r, s) for r, s in resources if r.is_active or r.id in busy_ids]
            ids = [r.id for r, _ in shown]
            weekly = await repo.load_weekly(session, ids) if ids else {}
            exceptions = await repo.load_exceptions(session, ids, day, day) if ids else {}
        working: dict[str, list[tuple[int, int]]] = {}
        for rid in ids:
            kind, intervals = exceptions[rid].get(day, (None, []))
            working[str(rid)] = day_intervals(day, weekly[rid], kind, intervals)
        return CalendarOut(
            date=day,
            resources=[resource_out(r, s) for r, s in shown],
            bookings=[booking_out(b, r) for b, r in rows],
            working=working,
        )

    async def detail(self, booking_id: uuid.UUID) -> AdminBookingDetail:
        async with self._sessionmaker() as session:
            found = await arepo.booking_with_resource(session, booking_id)
            if found is None:
                raise BookingNotFound
            events = await arepo.booking_events(session, booking_id)
        return AdminBookingDetail(
            booking=booking_out(*found),
            events=[event_out(e, (a.id, a.email) if a else None) for e, a in events],
        )

    async def slots(
        self,
        service_slug: str,
        resource_id: uuid.UUID | None,
        day: date,
        *,
        ignore_lead_time: bool,
    ) -> SlotsAdminOut:
        slots: list[Slot] = await self._bookings.slots(
            service_slug, resource_id, day, ignore_lead_time=ignore_lead_time
        )
        return SlotsAdminOut(
            date=day,
            slots=[
                SlotAdminOut(
                    starts_at=s.starts_at, ends_at=s.ends_at, resource_ids=list(s.resource_ids)
                )
                for s in slots
            ],
        )

    # ---------- действия над записью ----------

    async def create(self, identity: AdminIdentity, body: AdminBookingCreate) -> AdminBookingOut:
        result: BookingResult = await self._bookings.create(
            NewBooking(
                service_slug=body.service_slug,
                resource_id=body.resource_id,
                starts_at=body.starts_at,
                client=Client(
                    name=body.name,
                    phone=body.phone,
                    phone_source="admin",
                    comment=body.comment,
                ),
                source="admin",
                ignore_lead_time=True,
                notify_client=body.notify_client,
                actor_user_id=identity.user_id,
            )
        )
        return booking_out(result.booking, result.resource)

    async def reschedule(
        self, identity: AdminIdentity, booking_id: uuid.UUID, body: AdminReschedule
    ) -> AdminBookingOut:
        result = await self._bookings.admin_reschedule(
            booking_id,
            starts_at=body.starts_at,
            resource_id=body.resource_id,
            version=body.version,
            notify_client=body.notify_client,
            actor_user_id=identity.user_id,
        )
        return booking_out(result.booking, result.resource)

    async def change_status(
        self,
        identity: AdminIdentity,
        booking_id: uuid.UUID,
        *,
        status: str,
        cancel_reason: str | None,
        version: int,
    ) -> AdminBookingOut:
        target = BookingStatus(status)
        async with self._sessionmaker() as session, session.begin():
            found = await arepo.booking_with_resource(session, booking_id, for_update=True)
            if found is None:
                raise BookingNotFound
            booking, resource = found
            if booking.version != version:
                raise VersionConflict("Запись уже изменили")
            allowed = (
                {BookingStatus.CONFIRMED}
                if target == BookingStatus.CANCELLED_BY_BUSINESS
                else {BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW}
            )
            if booking.status not in allowed:
                raise BookingNotActive
            if booking.status == target:
                return booking_out(booking, resource)
            previous = booking.status
            await self._apply_status(
                session, booking, target, cancel_reason=cancel_reason, identity=identity
            )
            if target != BookingStatus.CANCELLED_BY_BUSINESS:
                await repo.add_event(
                    session,
                    booking_id=booking.id,
                    type_=BookingEventType.STATUS_CHANGED,
                    actor=BookingActor.ADMIN,
                    actor_user_id=identity.user_id,
                    payload={"from": previous.value, "to": target.value},
                )
            return booking_out(booking, resource)

    async def _apply_status(
        self,
        session: AsyncSession,
        booking: Booking,
        target: BookingStatus,
        *,
        cancel_reason: str | None,
        identity: AdminIdentity | None,
    ) -> None:
        reason = (cancel_reason or "").strip() or None
        await repo.set_status(session, booking, target, now=self._clock(), cancel_reason=reason)
        await repo.cancel_pending_outbox(session, booking.id)
        if target != BookingStatus.CANCELLED_BY_BUSINESS:
            return
        await repo.add_event(
            session,
            booking_id=booking.id,
            type_=BookingEventType.CANCELLED,
            actor=BookingActor.ADMIN if identity else BookingActor.SYSTEM,
            actor_user_id=identity.user_id if identity else None,
            payload={"by": "business", "reason": reason},
        )
        if booking.max_user_id is not None:
            await repo.add_outbox(
                session,
                kind="booking_cancelled_client",
                channel="max_user",
                payload={"booking_id": str(booking.id)},
            )

    async def add_note(self, identity: AdminIdentity, booking_id: uuid.UUID, text: str) -> EventOut:
        async with self._sessionmaker() as session, session.begin():
            if await repo.get_booking(session, booking_id) is None:
                raise BookingNotFound
            session.add(
                event := BookingEvent(
                    booking_id=booking_id,
                    type=BookingEventType.NOTE_ADDED.value,
                    actor=BookingActor.ADMIN.value,
                    actor_user_id=identity.user_id,
                    payload={"text": text},
                )
            )
            await session.flush()
            await session.refresh(event)
            return event_out(event, (identity.user_id, identity.email))

    # ---------- сотрудники ----------

    async def list_resources(self) -> list[ResourceAdminOut]:
        async with self._sessionmaker() as session:
            return [resource_out(r, s) for r, s in await arepo.resources_with_services(session)]

    async def create_resource(self, body: ResourceCreate) -> ResourceAdminOut:
        async with self._sessionmaker() as session, session.begin():
            resource = await arepo.add_resource(
                session, name=body.name, title=body.title or None, sort_order=body.sort_order
            )
            return resource_out(resource, [])

    async def _resource(
        self, session: AsyncSession, resource_id: uuid.UUID, *, lock: bool = False
    ) -> Resource:
        resource = await arepo.get_resource(session, resource_id, for_update=lock)
        if resource is None:
            raise NotFound("Сотрудник не найден")
        return resource

    async def patch_resource(self, resource_id: uuid.UUID, body: ResourcePatch) -> ResourceAdminOut:
        async with self._sessionmaker() as session, session.begin():
            resource = await self._resource(session, resource_id, lock=True)
            sent = body.model_fields_set
            if "name" in sent and body.name is not None:
                resource.name = body.name
            if "title" in sent:
                resource.title = body.title or None
            if "is_active" in sent and body.is_active is not None:
                resource.is_active = body.is_active
            if "sort_order" in sent and body.sort_order is not None:
                resource.sort_order = body.sort_order
            resource.updated_at = self._clock()
            await session.flush()
            rows = await arepo.resources_with_services(session, ids=[resource_id])
            return resource_out(resource, rows[0][1])

    async def delete_resource(self, resource_id: uuid.UUID) -> None:
        """Есть история — только выключаем (записи ссылаются на сотрудника); иначе удаляем."""
        async with self._sessionmaker() as session, session.begin():
            resource = await self._resource(session, resource_id, lock=True)
            if await arepo.has_future_bookings(session, resource_id, self._clock()):
                raise HasFutureBookings
            if await arepo.has_any_bookings(session, resource_id):
                resource.is_active = False
                resource.updated_at = self._clock()
            else:
                await session.delete(resource)

    async def set_services(self, resource_id: uuid.UUID, slugs: Sequence[str]) -> ResourceAdminOut:
        unique = sorted(set(slugs))
        for slug in unique:
            self._bookings.bookable(slug)  # service_not_bookable → 422
        async with self._sessionmaker() as session, session.begin():
            resource = await self._resource(session, resource_id, lock=True)
            await arepo.replace_services(session, resource_id, unique)
            return resource_out(resource, unique)

    # ---------- график ----------

    async def get_working_hours(self, resource_id: uuid.UUID) -> WorkingHoursOut:
        async with self._sessionmaker() as session:
            await self._resource(session, resource_id)
            weekly = await arepo.weekly_rows(session, resource_id)
        return WorkingHoursOut(days={d: weekly.get(d, []) for d in range(1, 8)})

    async def put_working_hours(
        self,
        resource_id: uuid.UUID,
        days: Mapping[int, Sequence[Interval]],
        *,
        force: bool,
        cancel_conflicting: bool,
    ) -> WorkingHoursOut:
        if any(not 1 <= d <= 7 for d in days):
            raise ValidationFailed([FieldError("days", "invalid_weekday")])
        weekly = {d: validate_intervals(days.get(d, []), "days") for d in range(1, 8)}
        weekly = {d: v for d, v in weekly.items() if v}
        async with self._sessionmaker() as session, session.begin():
            await self._resource(session, resource_id, lock=True)
            exceptions = {
                e.date: e for e in await arepo.list_exceptions(session, resource_id, None, None)
            }
            await self._guard_schedule(
                session,
                resource_id,
                weekly=weekly,
                exceptions=exceptions,
                force=force,
                cancel_conflicting=cancel_conflicting,
            )
            await arepo.replace_weekly(session, resource_id, weekly)
        return WorkingHoursOut(days={d: weekly.get(d, []) for d in range(1, 8)})

    async def list_exceptions(
        self, resource_id: uuid.UUID, first: date | None, last: date | None
    ) -> list[ExceptionOut]:
        if first is not None and last is not None and last < first:
            raise ValidationFailed([FieldError("date_to", "range_invalid")])
        async with self._sessionmaker() as session:
            await self._resource(session, resource_id)
            rows = await arepo.list_exceptions(session, resource_id, first, last)
        return [_exception_out(e) for e in rows]

    async def put_exception(
        self,
        resource_id: uuid.UUID,
        body: ExceptionCreate,
        *,
        force: bool,
        cancel_conflicting: bool,
    ) -> ExceptionOut:
        """Исключение на дату заменяет прежнее на эту же дату."""
        intervals = validate_intervals(
            [(i.start_min, i.end_min) for i in body.intervals], "intervals"
        )
        if body.kind == "day_off" and intervals:
            raise ValidationFailed([FieldError("intervals", "intervals_not_allowed")])
        if body.kind == "custom_hours" and not intervals:
            raise ValidationFailed([FieldError("intervals", "intervals_required")])
        async with self._sessionmaker() as session, session.begin():
            await self._resource(session, resource_id, lock=True)
            weekly = await arepo.weekly_rows(session, resource_id)
            exceptions = {
                e.date: e for e in await arepo.list_exceptions(session, resource_id, None, None)
            }
            row = exceptions.get(body.date) or ScheduleException(
                resource_id=resource_id, date=body.date
            )
            row.kind = body.kind
            row.intervals = [{"start_min": s, "end_min": e} for s, e in intervals]
            row.note = body.note or None
            exceptions[body.date] = row
            await self._guard_schedule(
                session,
                resource_id,
                weekly=weekly,
                exceptions=exceptions,
                force=force,
                cancel_conflicting=cancel_conflicting,
            )
            session.add(row)
            await session.flush()
            await session.refresh(row)
            return _exception_out(row)

    async def delete_exception(
        self,
        resource_id: uuid.UUID,
        exception_id: uuid.UUID,
        *,
        force: bool,
        cancel_conflicting: bool,
    ) -> None:
        async with self._sessionmaker() as session, session.begin():
            await self._resource(session, resource_id, lock=True)
            row = await arepo.get_exception(session, resource_id, exception_id)
            if row is None:
                raise NotFound("Исключение не найдено")
            weekly = await arepo.weekly_rows(session, resource_id)
            exceptions = {
                e.date: e
                for e in await arepo.list_exceptions(session, resource_id, None, None)
                if e.id != exception_id
            }
            await self._guard_schedule(
                session,
                resource_id,
                weekly=weekly,
                exceptions=exceptions,
                force=force,
                cancel_conflicting=cancel_conflicting,
            )
            await session.delete(row)

    async def _guard_schedule(
        self,
        session: AsyncSession,
        resource_id: uuid.UUID,
        *,
        weekly: Mapping[int, Sequence[Interval]],
        exceptions: Mapping[date, ScheduleException],
        force: bool,
        cancel_conflicting: bool,
    ) -> None:
        """Будущие записи вне нового графика: без `force` — 409 со списком, с ним — по выбору."""
        conflicts = [
            booking
            for booking in await arepo.future_confirmed(session, resource_id, self._clock())
            if not self._fits(booking, weekly, exceptions)
        ]
        if not conflicts:
            return
        if not force:
            raise ConflictsWithBookings(
                extra={"bookings": [self._conflict(b) for b in conflicts]},
            )
        if cancel_conflicting:
            for booking in conflicts:
                await self._apply_status(
                    session,
                    booking,
                    BookingStatus.CANCELLED_BY_BUSINESS,
                    cancel_reason=SCHEDULE_CHANGE_REASON,
                    identity=None,
                )

    def _fits(
        self,
        booking: Booking,
        weekly: Mapping[int, Sequence[Interval]],
        exceptions: Mapping[date, ScheduleException],
    ) -> bool:
        day = booking.starts_at.astimezone(self.tz).date()
        row = exceptions.get(day)
        work = day_intervals(
            day,
            weekly,
            row.kind if row else None,
            [(i["start_min"], i["end_min"]) for i in row.intervals] if row else (),
        )
        blocked_end = booking.blocked.upper or booking.ends_at
        return any(
            at_minute(day, start, self.tz) <= booking.starts_at
            and blocked_end <= at_minute(day, end, self.tz)
            for start, end in work
        )

    def _conflict(self, booking: Booking) -> dict[str, Any]:
        return {
            "id": str(booking.id),
            "public_number": booking.public_number,
            "starts_at": booking.starts_at.isoformat(),
            "client_name": booking.client_name,
            "service_title": booking.service_title_snapshot,
        }

    # ---------- настройки ----------

    async def get_settings(self) -> BookingSettingsOut:
        async with self._sessionmaker() as session:
            return settings_out(await repo.get_settings(session))

    async def patch_settings(self, body: BookingSettingsPatch) -> BookingSettingsOut:
        values = body.model_dump(exclude={"version"}, exclude_none=True)
        async with self._sessionmaker() as session, session.begin():
            if values and not await arepo.update_settings(
                session, body.version, values, self._clock()
            ):
                raise VersionConflict("Настройки уже изменили")
            row = await repo.get_settings(session)
            if not values and row.version != body.version:
                raise VersionConflict("Настройки уже изменили")
            await session.refresh(row)
            return settings_out(row)


def _exception_out(row: ScheduleException) -> ExceptionOut:
    return ExceptionOut(
        id=row.id, date=row.date, kind=row.kind, intervals=row.intervals, note=row.note
    )
