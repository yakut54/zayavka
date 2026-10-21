import re
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import LeadStatus
from app.models import AdminUser, Lead, LeadEvent
from app.schemas.admin_leads import LeadFilters, LeadSort

_SORTS: dict[str, tuple[Any, ...]] = {
    "created_at": (Lead.created_at.asc(), Lead.id.asc()),
    "-created_at": (Lead.created_at.desc(), Lead.id.desc()),
    "public_number": (Lead.public_number.asc(),),
    "-public_number": (Lead.public_number.desc(),),
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def build_conditions(filters: LeadFilters, tz: ZoneInfo) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if filters.status is not None:
        conditions.append(Lead.status == filters.status)
    if filters.date_from is not None:
        start = datetime.combine(filters.date_from, time.min, tzinfo=tz)
        conditions.append(Lead.created_at >= start)
    if filters.date_to is not None:
        end = datetime.combine(filters.date_to + timedelta(days=1), time.min, tzinfo=tz)
        conditions.append(Lead.created_at < end)
    q = (filters.q or "").strip()
    if q:
        options: list[ColumnElement[bool]] = [Lead.name.ilike(f"%{_escape_like(q)}%", escape="\\")]
        digits = re.sub(r"\D", "", q)
        if digits:
            phone_digits = func.regexp_replace(Lead.phone_e164, r"\D", "", "g")
            options.append(phone_digits.like(f"%{digits}%"))
        if q.isdigit() and len(q) <= 18:
            options.append(Lead.public_number == int(q))
        conditions.append(or_(*options))
    return conditions


async def list_leads(
    session: AsyncSession,
    filters: LeadFilters,
    tz: ZoneInfo,
    *,
    sort: LeadSort,
    page: int,
    page_size: int,
) -> tuple[list[Lead], int]:
    where = build_conditions(filters, tz)
    total = (
        await session.execute(select(func.count()).select_from(Lead).where(*where))
    ).scalar_one()
    rows = (
        await session.execute(
            select(Lead)
            .where(*where)
            .order_by(*_SORTS[sort])
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).scalars()
    return list(rows), int(total)


async def stream_leads(
    session: AsyncSession, filters: LeadFilters, tz: ZoneInfo
) -> AsyncIterator[Lead]:
    stmt = (
        select(Lead)
        .where(*build_conditions(filters, tz))
        .order_by(*_SORTS["-created_at"])
        .execution_options(yield_per=500)
    )
    result = await session.stream_scalars(stmt)
    async for lead in result:
        yield lead


async def get_lead(session: AsyncSession, lead_id: uuid.UUID, *, lock: bool = False) -> Lead | None:
    stmt = select(Lead).where(Lead.id == lead_id)
    if lock:
        stmt = stmt.with_for_update()
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_events(
    session: AsyncSession, lead_id: uuid.UUID
) -> list[tuple[LeadEvent, AdminUser | None]]:
    rows = await session.execute(
        select(LeadEvent, AdminUser)
        .outerjoin(AdminUser, AdminUser.id == LeadEvent.actor_user_id)
        .where(LeadEvent.lead_id == lead_id)
        .order_by(LeadEvent.created_at.asc(), LeadEvent.id.asc())
    )
    return [(event, user) for event, user in rows.all()]


async def set_status(session: AsyncSession, lead: Lead, status: LeadStatus) -> None:
    lead.status = status
    lead.version = Lead.version + 1
    lead.updated_at = func.now()
    await session.flush()
    await session.refresh(lead)
