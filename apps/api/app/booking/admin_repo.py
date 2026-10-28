"""Запросы админки записи: список и календарь, ресурсы, график, настройки."""

import re
import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

from sqlalchemy import ColumnElement, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import BookingStatus
from app.models import (
    AdminUser,
    Booking,
    BookingEvent,
    BookingSettings,
    Resource,
    ResourceService,
    ScheduleException,
    WorkingHours,
)

FREE_STATUSES = (BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_bookings(
    session: AsyncSession,
    *,
    start: datetime,
    end: datetime,
    resource_id: uuid.UUID | None,
    status: BookingStatus | None,
    q: str | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[Booking, Resource]], int]:
    where: list[ColumnElement[bool]] = [Booking.starts_at >= start, Booking.starts_at < end]
    if resource_id is not None:
        where.append(Booking.resource_id == resource_id)
    if status is not None:
        where.append(Booking.status == status)
    text_q = (q or "").strip()
    if text_q:
        options: list[ColumnElement[bool]] = [
            Booking.client_name.ilike(f"%{_escape_like(text_q)}%", escape="\\")
        ]
        digits = re.sub(r"\D", "", text_q)
        if digits:
            phone_digits = func.regexp_replace(Booking.client_phone_e164, r"\D", "", "g")
            options.append(phone_digits.like(f"%{digits}%"))
        if text_q.isdigit() and len(text_q) <= 18:
            options.append(Booking.public_number == int(text_q))
        where.append(or_(*options))
    total = (
        await session.execute(select(func.count()).select_from(Booking).where(*where))
    ).scalar_one()
    rows = await session.execute(
        select(Booking, Resource)
        .join(Resource, Resource.id == Booking.resource_id)
        .where(*where)
        .order_by(Booking.starts_at, Booking.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return [(b, r) for b, r in rows], int(total)


async def day_bookings(
    session: AsyncSession, start: datetime, end: datetime
) -> list[tuple[Booking, Resource]]:
    rows = await session.execute(
        select(Booking, Resource)
        .join(Resource, Resource.id == Booking.resource_id)
        .where(
            Booking.starts_at >= start,
            Booking.starts_at < end,
            Booking.status.in_(FREE_STATUSES),
        )
        .order_by(Booking.starts_at, Booking.id)
    )
    return [(b, r) for b, r in rows]


async def booking_with_resource(
    session: AsyncSession, booking_id: uuid.UUID, *, for_update: bool = False
) -> tuple[Booking, Resource] | None:
    query = (
        select(Booking, Resource)
        .join(Resource, Resource.id == Booking.resource_id)
        .where(Booking.id == booking_id)
    )
    if for_update:
        query = query.with_for_update(of=Booking)
    row = (await session.execute(query)).first()
    return None if row is None else (row[0], row[1])


async def booking_events(
    session: AsyncSession, booking_id: uuid.UUID
) -> list[tuple[BookingEvent, AdminUser | None]]:
    rows = await session.execute(
        select(BookingEvent, AdminUser)
        .outerjoin(AdminUser, AdminUser.id == BookingEvent.actor_user_id)
        .where(BookingEvent.booking_id == booking_id)
        .order_by(BookingEvent.created_at, BookingEvent.id)
    )
    return [(e, a) for e, a in rows]


async def resources_with_services(
    session: AsyncSession, *, only_active: bool = False, ids: Sequence[uuid.UUID] | None = None
) -> list[tuple[Resource, list[str]]]:
    query = select(Resource).order_by(Resource.sort_order, Resource.name, Resource.id)
    if only_active:
        query = query.where(Resource.is_active.is_(True))
    if ids is not None:
        query = query.where(Resource.id.in_(ids))
    resources = list((await session.execute(query)).scalars())
    slugs: dict[uuid.UUID, list[str]] = defaultdict(list)
    if resources:
        rows = await session.execute(
            select(ResourceService.resource_id, ResourceService.service_slug)
            .where(ResourceService.resource_id.in_([r.id for r in resources]))
            .order_by(ResourceService.service_slug)
        )
        for rid, slug in rows:
            slugs[rid].append(slug)
    return [(r, slugs.get(r.id, [])) for r in resources]


async def get_resource(
    session: AsyncSession, resource_id: uuid.UUID, *, for_update: bool = False
) -> Resource | None:
    query = select(Resource).where(Resource.id == resource_id)
    if for_update:
        query = query.with_for_update()
    return (await session.execute(query)).scalar_one_or_none()


async def add_resource(session: AsyncSession, **values: Any) -> Resource:
    resource = Resource(**values)
    session.add(resource)
    await session.flush()
    await session.refresh(resource)
    return resource


async def has_future_bookings(session: AsyncSession, resource_id: uuid.UUID, now: datetime) -> bool:
    found = await session.execute(
        select(Booking.id)
        .where(
            Booking.resource_id == resource_id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.ends_at > now,
        )
        .limit(1)
    )
    return found.first() is not None


async def has_any_bookings(session: AsyncSession, resource_id: uuid.UUID) -> bool:
    found = await session.execute(
        select(Booking.id).where(Booking.resource_id == resource_id).limit(1)
    )
    return found.first() is not None


async def replace_services(
    session: AsyncSession, resource_id: uuid.UUID, slugs: Sequence[str]
) -> None:
    await session.execute(delete(ResourceService).where(ResourceService.resource_id == resource_id))
    session.add_all(ResourceService(resource_id=resource_id, service_slug=s) for s in slugs)
    await session.flush()


async def weekly_rows(
    session: AsyncSession, resource_id: uuid.UUID
) -> dict[int, list[tuple[int, int]]]:
    rows = await session.execute(
        select(WorkingHours.weekday, WorkingHours.start_min, WorkingHours.end_min)
        .where(WorkingHours.resource_id == resource_id)
        .order_by(WorkingHours.weekday, WorkingHours.start_min)
    )
    result: dict[int, list[tuple[int, int]]] = {}
    for weekday, start, end in rows:
        result.setdefault(weekday, []).append((start, end))
    return result


async def replace_weekly(
    session: AsyncSession, resource_id: uuid.UUID, days: dict[int, list[tuple[int, int]]]
) -> None:
    await session.execute(delete(WorkingHours).where(WorkingHours.resource_id == resource_id))
    session.add_all(
        WorkingHours(resource_id=resource_id, weekday=day, start_min=start, end_min=end)
        for day, intervals in days.items()
        for start, end in intervals
    )
    await session.flush()


async def list_exceptions(
    session: AsyncSession, resource_id: uuid.UUID, first: date | None, last: date | None
) -> list[ScheduleException]:
    query = select(ScheduleException).where(ScheduleException.resource_id == resource_id)
    if first is not None:
        query = query.where(ScheduleException.date >= first)
    if last is not None:
        query = query.where(ScheduleException.date <= last)
    return list((await session.execute(query.order_by(ScheduleException.date))).scalars())


async def get_exception(
    session: AsyncSession, resource_id: uuid.UUID, exception_id: uuid.UUID
) -> ScheduleException | None:
    return (
        await session.execute(
            select(ScheduleException).where(
                ScheduleException.id == exception_id, ScheduleException.resource_id == resource_id
            )
        )
    ).scalar_one_or_none()


async def exception_on(
    session: AsyncSession, resource_id: uuid.UUID, day: date
) -> ScheduleException | None:
    return (
        await session.execute(
            select(ScheduleException).where(
                ScheduleException.resource_id == resource_id, ScheduleException.date == day
            )
        )
    ).scalar_one_or_none()


async def future_confirmed(
    session: AsyncSession, resource_id: uuid.UUID, now: datetime
) -> list[Booking]:
    return list(
        (
            await session.execute(
                select(Booking)
                .where(
                    Booking.resource_id == resource_id,
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.ends_at > now,
                )
                .order_by(Booking.starts_at)
            )
        ).scalars()
    )


async def update_settings(
    session: AsyncSession, version: int, values: dict[str, Any], now: datetime
) -> bool:
    """Изменение с проверкой версии; False — настройки успели поменять."""
    result = await session.execute(
        update(BookingSettings)
        .where(BookingSettings.id == 1, BookingSettings.version == version)
        .values(**values, version=BookingSettings.version + 1, updated_at=now)
    )
    return bool(result.rowcount)  # type: ignore[attr-defined]
