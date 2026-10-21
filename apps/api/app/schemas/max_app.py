import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints

from app.domain.enums import BookingStatus
from app.schemas.common import InputModel


class ContactProof(InputModel):
    """Ответ `WebApp.requestContact()`."""

    model_config = ConfigDict(extra="forbid")

    phone: Annotated[str, StringConstraints(max_length=32)]
    authDate: Annotated[str, StringConstraints(max_length=32)]
    hash: Annotated[str, StringConstraints(max_length=128)]


class BookingCreate(InputModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    service_slug: Annotated[str, StringConstraints(max_length=64)]
    resource_id: uuid.UUID | None = None  # None = любой специалист
    starts_at: AwareDatetime
    name: Annotated[str, StringConstraints(min_length=2, max_length=100)]
    phone: Annotated[str, StringConstraints(max_length=32)]
    contact_proof: ContactProof | None = None
    comment: Annotated[str, StringConstraints(max_length=500)] | None = None
    consent: Literal[True]
    policy_version: str


class CancelRequest(InputModel):
    model_config = ConfigDict(extra="forbid")

    version: int


class RescheduleRequest(InputModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: AwareDatetime
    resource_id: uuid.UUID | None = None
    version: int


class DemoSessionRequest(InputModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    first_name: Annotated[str, StringConstraints(min_length=1, max_length=64)]


class DemoSession(BaseModel):
    init_data: str


class UserOut(BaseModel):
    first_name: str


class BusinessOut(BaseModel):
    name: str
    phone: str
    address: str
    working_hours: str
    timezone: str


class ServiceOut(BaseModel):
    slug: str
    title: str
    price_from: int | None
    duration_min: int


class ResourceOut(BaseModel):
    id: uuid.UUID
    name: str
    title: str | None
    service_slugs: list[str]


class SettingsOut(BaseModel):
    cancel_deadline_min: int
    horizon_days: int


class LegalOut(BaseModel):
    policy_version: str
    privacy_url: str
    consent_url: str
    terms_url: str | None
    operator: str
    support: str


class Bootstrap(BaseModel):
    user: UserOut
    business: BusinessOut
    services: list[ServiceOut]
    resources: list[ResourceOut]
    settings: SettingsOut
    legal: LegalOut


class DayAvailability(BaseModel):
    date: date
    available: bool


class SlotOut(BaseModel):
    starts_at: datetime
    ends_at: datetime


class SlotsOut(BaseModel):
    date: date
    slots: list[SlotOut]


class ServiceRef(BaseModel):
    slug: str
    title: str


class ResourceRef(BaseModel):
    id: uuid.UUID
    name: str
    title: str | None


class BookingView(BaseModel):
    id: uuid.UUID
    public_number: int
    status: BookingStatus
    service: ServiceRef
    resource: ResourceRef
    starts_at: datetime
    ends_at: datetime
    can_change: bool
    change_deadline: datetime
    version: int


class BookingPage(BaseModel):
    items: list[BookingView]
    page: int
    total: int


class MaxLeadCreated(BaseModel):
    public_number: int
