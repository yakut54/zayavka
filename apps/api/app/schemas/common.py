import re
from datetime import date
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, field_validator

ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
MIN_YEAR, MAX_YEAR = 1970, 2200  # за пределами перевод в UTC и в метку времени ломается

_UNSAFE = re.compile("[\x00\ud800-\udfff]")


def reject_unsafe_text(value: str) -> str:
    """NUL и одиночные суррогаты PostgreSQL/JSON не принимают — это 422, а не 500."""
    if _UNSAFE.search(value):
        raise ValueError("unsafe characters")
    return value


class InputModel(BaseModel):
    """База входных схем: во всех строковых полях запрещены управляющие символы NUL и суррогаты."""

    @field_validator("*", mode="after")
    @classmethod
    def _no_unsafe_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            reject_unsafe_text(value)
        elif isinstance(value, dict):
            for item in value.values():
                if isinstance(item, str):
                    reject_unsafe_text(item)
        return value


def _iso_date_only(value: object) -> object:
    """Только YYYY-MM-DD: pydantic иначе принял бы число как unix-время (`date_to=0`)."""
    if (
        isinstance(value, str)
        and ISO_DATE.fullmatch(value)
        and MIN_YEAR <= int(value[:4]) <= MAX_YEAR
    ):
        return value
    raise ValueError("expected YYYY-MM-DD")


IsoDate = Annotated[date, BeforeValidator(_iso_date_only)]
