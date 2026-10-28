import csv
import io
import uuid
from collections.abc import AsyncIterator, Mapping
from datetime import datetime
from zoneinfo import ZoneInfo

import phonenumbers
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.enums import LeadEventType, LeadStatus
from app.domain.errors import LeadNotFound, VersionConflict
from app.models import AdminUser, Lead, LeadEvent
from app.repositories import admin_leads as repo
from app.repositories import leads as lead_repo
from app.schemas.admin_leads import (
    ActorOut,
    EventOut,
    LeadDetail,
    LeadFilters,
    LeadOut,
    LeadPage,
    LeadSort,
)
from app.security.sessions import AdminIdentity

CSV_BOM = "﻿"
CSV_DELIMITER = ";"
CSV_HEADER = ["Номер", "Дата", "Имя", "Телефон", "Email", "Услуга", "Статус", "Сообщение"]
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

STATUS_LABELS = {
    LeadStatus.NEW: "Новая",
    LeadStatus.IN_PROGRESS: "В работе",
    LeadStatus.DONE: "Выполнена",
    LeadStatus.SPAM: "Спам",
    LeadStatus.ARCHIVED: "В архиве",
}


def escape_csv_cell(value: str) -> str:
    """Защита от CSV-инъекций: ячейка, начинающаяся с формулы, получает ведущий апостроф."""
    return f"'{value}" if value.startswith(_FORMULA_PREFIXES) else value


def format_phone(phone_e164: str) -> str:
    """«8 (912) 345-67-89» — начинается с цифры, поэтому Excel не примет номер за формулу."""
    try:
        parsed = phonenumbers.parse(phone_e164, None)
    except phonenumbers.NumberParseException:
        return phone_e164
    if parsed.country_code == 7:
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)


def csv_row(lead: Lead, tz: ZoneInfo, titles: Mapping[str, str]) -> list[str]:
    service = (titles.get(lead.service_slug, lead.service_slug) if lead.service_slug else "") or ""
    cells = [
        str(lead.public_number),
        lead.created_at.astimezone(tz).strftime("%Y-%m-%d %H:%M"),
        lead.name,
        format_phone(lead.phone_e164),
        lead.email or "",
        service,
        STATUS_LABELS[lead.status],
        lead.message or "",
    ]
    return [escape_csv_cell(c) for c in cells]


def csv_line(cells: list[str]) -> str:
    buffer = io.StringIO()
    csv.writer(buffer, delimiter=CSV_DELIMITER, lineterminator="\r\n").writerow(cells)
    return buffer.getvalue()


def event_out(event: LeadEvent, actor: AdminUser | None) -> EventOut:
    return EventOut(
        id=event.id,
        type=event.type,
        actor=ActorOut(id=actor.id, email=actor.email) if actor else None,
        payload=event.payload,
        created_at=event.created_at,
    )


class AdminLeadService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        tz: ZoneInfo,
        titles: Mapping[str, str],
    ) -> None:
        self._sessionmaker = sessionmaker
        self._tz = tz
        self._titles = titles

    async def list(
        self,
        session: AsyncSession,
        filters: LeadFilters,
        *,
        sort: LeadSort,
        page: int,
        page_size: int,
    ) -> LeadPage:
        leads, total = await repo.list_leads(
            session, filters, self._tz, sort=sort, page=page, page_size=page_size
        )
        return LeadPage(
            items=[LeadOut.model_validate(lead) for lead in leads],
            page=page,
            page_size=page_size,
            total=total,
        )

    async def detail(self, session: AsyncSession, lead_id: uuid.UUID) -> LeadDetail:
        lead = await repo.get_lead(session, lead_id)
        if lead is None:
            raise LeadNotFound
        events = await repo.list_events(session, lead_id)
        return LeadDetail(
            lead=LeadOut.model_validate(lead),
            events=[event_out(e, a) for e, a in events],
        )

    async def change_status(
        self,
        session: AsyncSession,
        identity: AdminIdentity,
        lead_id: uuid.UUID,
        *,
        status: LeadStatus,
        version: int,
    ) -> LeadOut:
        async with session.begin():
            lead = await repo.get_lead(session, lead_id, lock=True)
            if lead is None:
                raise LeadNotFound
            if lead.version != version:
                raise VersionConflict
            if lead.status != status:
                previous = lead.status
                await repo.set_status(session, lead, status)
                await lead_repo.add_event(
                    session,
                    lead_id=lead.id,
                    type_=LeadEventType.STATUS_CHANGED,
                    payload={"from": previous.value, "to": status.value},
                    actor_user_id=identity.user_id,
                )
            return LeadOut.model_validate(lead)

    async def add_note(
        self,
        session: AsyncSession,
        identity: AdminIdentity,
        lead_id: uuid.UUID,
        text: str,
    ) -> EventOut:
        async with session.begin():
            if await repo.get_lead(session, lead_id) is None:
                raise LeadNotFound
            event = await lead_repo.add_event(
                session,
                lead_id=lead_id,
                type_=LeadEventType.NOTE_ADDED,
                payload={"text": text},
                actor_user_id=identity.user_id,
            )
            await session.refresh(event)
            return EventOut(
                id=event.id,
                type=event.type,
                actor=ActorOut(id=identity.user_id, email=identity.email),
                payload=event.payload,
                created_at=event.created_at,
            )

    async def export_csv(self, filters: LeadFilters) -> AsyncIterator[bytes]:
        """Поток CSV: UTF-8 с BOM, разделитель «;» — открывается в русском Excel двойным кликом."""
        yield (CSV_BOM + csv_line(CSV_HEADER)).encode()
        async with self._sessionmaker() as session:
            async for lead in repo.stream_leads(session, filters, self._tz):
                yield csv_line(csv_row(lead, self._tz, self._titles)).encode()


def export_filename(tz: ZoneInfo) -> str:
    return f"leads-{datetime.now(tz):%Y-%m-%d}.csv"
