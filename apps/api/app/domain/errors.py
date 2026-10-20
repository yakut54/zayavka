from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class FieldError:
    field: str
    code: str


class DomainError(Exception):
    """Ошибка домена; в HTTP мапится в одном месте (app/errors.py)."""

    status = 500
    code = "internal_error"
    detail = "Внутренняя ошибка"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.detail)
        if detail is not None:
            self.detail = detail


class BadRequest(DomainError):
    status = 400
    code = "bad_request"
    detail = "Некорректный запрос"


class Unauthenticated(DomainError):
    status = 401
    code = "unauthenticated"
    detail = "Требуется вход"


class CsrfFailed(DomainError):
    status = 403
    code = "csrf_failed"
    detail = "Неверный CSRF-токен"


class NotFound(DomainError):
    status = 404
    code = "not_found"
    detail = "Не найдено"


class LeadNotFound(NotFound):
    detail = "Заявка не найдена"


class VersionConflict(DomainError):
    status = 409
    code = "version_conflict"
    detail = "Заявку уже изменили"


class ValidationFailed(DomainError):
    status = 422
    code = "validation_error"
    detail = "Одно или несколько полей заполнены неверно"

    def __init__(self, errors: list[FieldError], detail: str | None = None) -> None:
        super().__init__(detail)
        self.errors = errors


class RateLimited(DomainError):
    status = 429
    code = "rate_limited"
    detail = "Слишком много запросов"

    def __init__(self, retry_after: int) -> None:
        super().__init__()
        self.retry_after = retry_after
