import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StringConstraints,
    ValidationInfo,
    field_validator,
)

from app.domain.enums import BookingStatus
from app.schemas.admin_leads import EventOut
from app.schemas.common import InputModel
from app.schemas.max_app import ResourceRef, ServiceRef

Phone = Annotated[str, StringConstraints(max_length=32)]
Minutes = tuple[int, int]
Version = Annotated[int, Field(ge=1, le=2_147_483_647, strict=True)]
SortOrder = Annotated[int, Field(ge=-10_000, le=10_000, strict=True)]


class AdminBookingOut(BaseModel):
    id: uuid.UUID
    public_number: int
    status: BookingStatus
    service: ServiceRef
    resource: ResourceRef
    starts_at: datetime
    ends_at: datetime
    client_name: str
    client_phone_e164: str
    comment: str | None
    source: str
    phone_source: str
    has_max: bool
    cancel_reason: str | None
    rescheduled_from_id: uuid.UUID | None
    anonymized_at: datetime | None
    version: int
    created_at: datetime


class AdminBookingPage(BaseModel):
    items: list[AdminBookingOut]
    page: int
    page_size: int
    total: int


class AdminBookingDetail(BaseModel):
    booking: AdminBookingOut
    events: list[EventOut]


class AdminBookingCreate(InputModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    service_slug: Annotated[str, StringConstraints(max_length=64)]
    resource_id: uuid.UUID | None = None  # None = любой специалист
    starts_at: AwareDatetime
    name: Annotated[str, StringConstraints(min_length=2, max_length=100)]
    phone: Phone
    comment: Annotated[str, StringConstraints(max_length=500)] | None = None
    notify_client: StrictBool = False


class AdminBookingStatusUpdate(InputModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Literal["completed", "no_show", "cancelled_by_business"]
    cancel_reason: Annotated[str, StringConstraints(max_length=300)] | None = None
    version: Version
    notify_client: StrictBool = True  # только для отмены; без MAX-пользователя слать некому


class AdminReschedule(InputModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: AwareDatetime
    resource_id: uuid.UUID | None = None
    version: Version
    notify_client: StrictBool = True


class SlotAdminOut(BaseModel):
    starts_at: datetime
    ends_at: datetime
    resource_ids: list[uuid.UUID]


class SlotsAdminOut(BaseModel):
    date: date
    slots: list[SlotAdminOut]


class ResourceAdminOut(BaseModel):
    id: uuid.UUID
    name: str
    title: str | None
    is_active: bool
    sort_order: int
    service_slugs: list[str]


class CalendarOut(BaseModel):
    date: date
    resources: list[ResourceAdminOut]
    bookings: list[AdminBookingOut]
    working: dict[str, list[Minutes]]  # resource_id → [[start_min, end_min]] выбранного дня


class _ResourceText(InputModel):
    """Длина проверяется до обрезки пробелов, иначе схема OpenAPI расходится с проверкой."""

    @field_validator("name", "title", mode="after", check_fields=False)
    @classmethod
    def _strip(cls, value: str | None, info: ValidationInfo) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if info.field_name == "name" and not value:
            raise ValueError("name is empty")
        return value


class ResourceCreate(_ResourceText):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    title: Annotated[str, StringConstraints(max_length=80)] | None = None
    sort_order: SortOrder = 0


class ResourcePatch(_ResourceText):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(min_length=1, max_length=80)] | None = None
    title: Annotated[str, StringConstraints(max_length=80)] | None = None
    is_active: StrictBool | None = None
    sort_order: SortOrder | None = None


class ResourceServices(InputModel):
    model_config = ConfigDict(extra="forbid")

    service_slugs: list[Annotated[str, StringConstraints(max_length=64)]] = Field(max_length=100)


class WorkingHoursBody(InputModel):
    """Неделя целиком: ключ — день ISO (1 = понедельник), значение — интервалы в минутах."""

    model_config = ConfigDict(extra="forbid")

    days: dict[int, list[Minutes]]


class WorkingHoursOut(BaseModel):
    days: dict[int, list[Minutes]]  # всегда все семь дней


class IntervalIn(InputModel):
    model_config = ConfigDict(extra="forbid")

    start_min: Annotated[int, Field(strict=True)]
    end_min: Annotated[int, Field(strict=True)]


class ExceptionCreate(InputModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    date: date
    kind: Literal["day_off", "custom_hours"]
    intervals: list[IntervalIn] = Field(default_factory=list, max_length=20)
    note: Annotated[str, StringConstraints(max_length=200)] | None = None


class ExceptionOut(BaseModel):
    id: uuid.UUID
    date: date
    kind: str
    intervals: list[dict[str, int]]
    note: str | None


class BookingSettingsOut(BaseModel):
    slot_step_min: int
    min_lead_min: int
    horizon_days: int
    cancel_deadline_min: int
    reminders_enabled: bool
    version: int


class BookingSettingsPatch(InputModel):
    model_config = ConfigDict(extra="forbid")

    slot_step_min: Literal[5, 10, 15, 20, 30, 60] | None = None
    min_lead_min: Annotated[int, Field(ge=0, le=10_080, strict=True)] | None = None
    horizon_days: Annotated[int, Field(ge=1, le=90, strict=True)] | None = None
    cancel_deadline_min: Annotated[int, Field(ge=0, le=10_080, strict=True)] | None = None
    reminders_enabled: StrictBool | None = None
    version: Version
