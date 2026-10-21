import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.domain.enums import LeadStatus
from app.schemas.common import InputModel

LeadSort = Literal["created_at", "-created_at", "public_number", "-public_number"]


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    public_number: int
    name: str
    phone_e164: str
    email: str | None
    message: str | None
    service_slug: str | None
    source: str
    utm: dict[str, Any]
    status: LeadStatus
    version: int
    anonymized_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ActorOut(BaseModel):
    id: uuid.UUID
    email: str


class EventOut(BaseModel):
    id: uuid.UUID
    type: str
    actor: ActorOut | None
    payload: dict[str, Any]
    created_at: datetime


class LeadDetail(BaseModel):
    lead: LeadOut
    events: list[EventOut]


class LeadPage(BaseModel):
    items: list[LeadOut]
    page: int
    page_size: int
    total: int


class LeadStatusUpdate(InputModel):
    model_config = ConfigDict(extra="forbid")

    status: LeadStatus
    version: int = Field(ge=1, strict=True)


class NoteCreate(InputModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class LeadFilters(BaseModel):
    status: LeadStatus | None = None
    q: str | None = None
    date_from: date | None = None
    date_to: date | None = None
