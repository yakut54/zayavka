import uuid
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class LeadView:
    """Данные заявки для уведомления. Читаются воркером из БД, в outbox их нет."""

    id: uuid.UUID
    public_number: int
    name: str
    phone_e164: str
    email: str | None
    message: str | None
    service_slug: str | None
    service_title: str | None


class Channel(Protocol):
    name: str

    async def send_lead_created(self, lead: LeadView) -> None: ...
