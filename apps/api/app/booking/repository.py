import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

from sqlalchemy import and_, func, select, text, update
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.ext.asyncio import AsyncSession

from app.booking.slots import Interval, UtcInterval
from app.domain.enums import BookingActor, BookingEventType, BookingStatus
from app.models import (
    Booking,
    BookingEvent,
    BookingSettings,
    Consent,
    NotificationOutbox,
    Resource,
    ResourceService,
    ScheduleException,
    WorkingHours,
)

Weekly = dict[int, list[Interval]]
Exceptions = dict[date, tuple[str, list[Interval]]]

EXCLUSION_VIOLATION = "23P01"
UNIQUE_VIOLATION = "23505"


async def get_settings(session: AsyncSession) -> BookingSettings:
    return (
        await session.execute(select(BookingSettings).where(BookingSettings.id == 1))
    ).scalar_one()


async def resources_for_service(
    session: AsyncSession, service_slug: str, resource_id: uuid.UUID | None = None
) -> list[Resource]:
    """Активные ресурсы, оказывающие услугу, в порядке выбора (sort_order, имя)."""
    query = (
        select(Resource)
        .join(ResourceService, ResourceService.resource_id == Resource.id)
        .where(ResourceService.service_slug == service_slug, Resource.is_active.is_(True))
        .order_by(Resource.sort_order, Resource.name, Resource.id)
    )
    if resource_id is not None:
        query = query.where(Resource.id == resource_id)
    return list((await session.execute(query)).scalars())


async def load_weekly(session: AsyncSession, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Weekly]:
    rows = await session.execute(
        select(
            WorkingHours.resource_id,
            WorkingHours.weekday,
            WorkingHours.start_min,
            WorkingHours.end_min,
        ).where(WorkingHours.resource_id.in_(ids))
    )
    result: dict[uuid.UUID, Weekly] = {rid: {} for rid in ids}
    for rid, weekday, start, end in rows:
        result[rid].setdefault(weekday, []).append((start, end))
    return result


def parse_intervals(raw: Sequence[dict[str, int]]) -> list[Interval]:
    return [(item["start_min"], item["end_min"]) for item in raw]


async def load_exceptions(
    session: AsyncSession, ids: Sequence[uuid.UUID], first: date, last: date
) -> dict[uuid.UUID, Exceptions]:
    rows = await session.execute(
        select(ScheduleException).where(
            ScheduleException.resource_id.in_(ids),
            ScheduleException.date.between(first, last),
        )
    )
    result: dict[uuid.UUID, Exceptions] = {rid: {} for rid in ids}
    for exc in rows.scalars():
        result[exc.resource_id][exc.date] = (exc.kind, parse_intervals(exc.intervals))
    return result


async def load_busy(
    session: AsyncSession,
    ids: Sequence[uuid.UUID],
    start: datetime,
    end: datetime,
) -> dict[uuid.UUID, list[UtcInterval]]:
    """Занятые интервалы (с буфером) подтверждённых записей, пересекающие [start, end)."""
    rows = await session.execute(
        select(Booking.resource_id, Booking.blocked).where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.resource_id.in_(ids),
            Booking.blocked.overlaps(Range(start, end, bounds="[)")),
        )
    )
    result: dict[uuid.UUID, list[UtcInterval]] = defaultdict(list)
    for rid, blocked in rows:
        if blocked.lower is None or blocked.upper is None:
            continue
        result[rid].append((blocked.lower, blocked.upper))
    return result


async def count_confirmed(
    session: AsyncSession, ids: Sequence[uuid.UUID], start: datetime, end: datetime
) -> dict[uuid.UUID, int]:
    rows = await session.execute(
        select(Booking.resource_id, func.count())
        .where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.resource_id.in_(ids),
            Booking.starts_at >= start,
            Booking.starts_at < end,
        )
        .group_by(Booking.resource_id)
    )
    return {rid: count for rid, count in rows}


async def get_booking(
    session: AsyncSession, booking_id: uuid.UUID, *, for_update: bool = False
) -> Booking | None:
    query = select(Booking).where(Booking.id == booking_id)
    if for_update:
        query = query.with_for_update()
    return (await session.execute(query)).scalar_one_or_none()


async def get_resource(session: AsyncSession, resource_id: uuid.UUID) -> Resource:
    return (await session.execute(select(Resource).where(Resource.id == resource_id))).scalar_one()


async def booking_by_key(
    session: AsyncSession, max_user_id: int, idempotency_key: str
) -> Booking | None:
    return (
        await session.execute(
            select(Booking).where(
                Booking.max_user_id == max_user_id, Booking.idempotency_key == idempotency_key
            )
        )
    ).scalar_one_or_none()


async def add_consent(
    session: AsyncSession,
    *,
    policy_version: str,
    consent_text_sha256: bytes,
    ip_hash: bytes,
    user_agent: str,
) -> Consent:
    consent = Consent(
        policy_version=policy_version,
        consent_text_sha256=consent_text_sha256,
        ip_hash=ip_hash,
        user_agent=user_agent,
    )
    session.add(consent)
    await session.flush()
    return consent


async def add_booking(session: AsyncSession, **values: Any) -> Booking:
    booking = Booking(**values)
    session.add(booking)
    await session.flush()
    await session.refresh(booking)
    return booking


async def add_event(
    session: AsyncSession,
    *,
    booking_id: uuid.UUID,
    type_: BookingEventType,
    actor: BookingActor,
    payload: dict[str, Any],
    actor_user_id: uuid.UUID | None = None,
) -> None:
    session.add(
        BookingEvent(
            booking_id=booking_id,
            type=type_.value,
            actor=actor.value,
            payload=payload,
            actor_user_id=actor_user_id,
        )
    )
    await session.flush()


async def add_outbox(
    session: AsyncSession,
    *,
    kind: str,
    channel: str,
    payload: dict[str, Any],
    next_attempt_at: datetime | None = None,
    dedupe_key: str | None = None,
) -> None:
    row = NotificationOutbox(kind=kind, channel=channel, payload=payload, dedupe_key=dedupe_key)
    if next_attempt_at is not None:
        row.next_attempt_at = next_attempt_at
    session.add(row)
    await session.flush()


async def cancel_pending_outbox(session: AsyncSession, booking_id: uuid.UUID) -> int:
    result = await session.execute(
        text(
            "UPDATE notification_outbox SET status = 'cancelled'"
            " WHERE status = 'pending' AND payload ->> 'booking_id' = :id"
        ),
        {"id": str(booking_id)},
    )
    return int(result.rowcount)  # type: ignore[attr-defined]


async def set_status(
    session: AsyncSession,
    booking: Booking,
    status: BookingStatus,
    *,
    now: datetime,
    cancel_reason: str | None = None,
) -> None:
    values: dict[str, Any] = {
        "status": status,
        "version": Booking.version + 1,
        "updated_at": now,
    }
    if status in (BookingStatus.CANCELLED_BY_CLIENT, BookingStatus.CANCELLED_BY_BUSINESS):
        values["cancelled_at"] = now
        values["cancel_reason"] = cancel_reason
    await session.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    await session.flush()
    await session.refresh(booking)


async def list_for_user(
    session: AsyncSession,
    max_user_id: int,
    *,
    upcoming: bool,
    now: datetime,
    limit: int,
    offset: int,
) -> tuple[list[Booking], int]:
    is_upcoming = and_(Booking.status == BookingStatus.CONFIRMED, Booking.ends_at >= now)
    condition = is_upcoming if upcoming else ~is_upcoming
    base = select(Booking).where(Booking.max_user_id == max_user_id, condition)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    order = Booking.starts_at.asc() if upcoming else Booking.starts_at.desc()
    rows = await session.execute(base.order_by(order, Booking.id).limit(limit).offset(offset))
    return list(rows.scalars()), total
