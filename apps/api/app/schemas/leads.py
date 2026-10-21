from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.schemas.common import InputModel

UtmKey = Literal["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]


class LeadCreate(InputModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Annotated[str, StringConstraints(min_length=2, max_length=100)]
    phone: Annotated[str, StringConstraints(max_length=32)]
    email: EmailStr | None = None
    message: Annotated[str, StringConstraints(max_length=2000)] | None = None
    service_slug: Annotated[str, StringConstraints(max_length=64)] | None = None
    consent: Literal[True]
    policy_version: str
    utm: dict[UtmKey, Annotated[str, StringConstraints(max_length=200)]] = Field(
        default_factory=dict
    )
    website: str = ""  # honeypot: должно быть пустым
    elapsed_ms: int = Field(ge=0, strict=True)  # сколько форма была открыта, мс
    captcha_token: str | None = None


class LeadCreated(BaseModel):
    public_number: int
