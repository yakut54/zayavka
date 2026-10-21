from typing import Any

from pydantic import BaseModel


class FieldErrorOut(BaseModel):
    field: str
    code: str


class Problem(BaseModel):
    """application/problem+json (RFC 9457), раздел 7.3 ТЗ."""

    type: str
    title: str
    status: int
    code: str
    detail: str
    errors: list[FieldErrorOut] | None = None
    request_id: str | None = None


def problem_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    descriptions = {
        400: "Некорректный запрос",
        401: "Нет сессии или истекла",
        403: "Неверный CSRF-токен",
        404: "Не найдено",
        409: "Конфликт версий",
        422: "Ошибки валидации",
        429: "Превышен лимит",
        503: "Недоступно",
    }
    return {
        status: {
            "model": Problem,
            "description": descriptions[status],
            "content": {"application/problem+json": {}},
        }
        for status in statuses
    }
