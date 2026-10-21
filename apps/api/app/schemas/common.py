import re
from typing import Any

from pydantic import BaseModel, field_validator

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
