from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.domain.errors import DomainError, FieldError, RateLimited, ValidationFailed
from app.logging import get_logger

PROBLEM_JSON = "application/problem+json"

_HTTP_CODES = {
    400: ("bad_request", "Некорректный запрос"),
    401: ("unauthenticated", "Требуется вход"),
    403: ("csrf_failed", "Доступ запрещён"),
    404: ("not_found", "Не найдено"),
    405: ("bad_request", "Метод не поддерживается"),
}

_PYDANTIC_CODES = {
    "missing": "required",
    "string_too_short": "too_short",
    "string_too_long": "too_long",
}


def request_id_of(request: Request) -> str | None:
    value = request.scope.get("state", {}).get("request_id")
    return value if isinstance(value, str) else None


def problem_response(
    request: Request,
    *,
    status: int,
    code: str,
    detail: str,
    errors: list[FieldError] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    base = getattr(request.app.state, "problem_base", "")
    body: dict[str, Any] = {
        "type": f"{base}/problems/{code}",
        "title": code.replace("_", " ").capitalize(),
        "status": status,
        "code": code,
        "detail": detail,
        "request_id": request_id_of(request),
    }
    if errors is not None:
        body["errors"] = [{"field": e.field, "code": e.code} for e in errors]
    response_headers = dict(headers or {})
    if (rid := request_id_of(request)) is not None:
        response_headers["X-Request-ID"] = rid
    return JSONResponse(body, status_code=status, media_type=PROBLEM_JSON, headers=response_headers)


def _field_error(err: Any) -> FieldError:
    loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
    field = loc[0] if loc else "body"
    err_type: str = err["type"]
    if err_type == "literal_error" and field == "consent":
        code = "consent_required"
    elif err_type == "value_error" and "email" in str(err.get("msg", "")).lower():
        code = "email_invalid"
    else:
        code = _PYDANTIC_CODES.get(err_type, "invalid_format")
    return FieldError(field=field, code=code)


async def domain_error_handler(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(DomainError, exc)
    headers: dict[str, str] = {}
    if isinstance(exc, RateLimited):
        headers["Retry-After"] = str(exc.retry_after)
    errors = exc.errors if isinstance(exc, ValidationFailed) else None
    return problem_response(
        request,
        status=exc.status,
        code=exc.code,
        detail=exc.detail,
        errors=errors,
        headers=headers,
    )


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(RequestValidationError, exc)
    details = exc.errors()
    if any(d["type"] in ("json_invalid", "model_attributes_type") for d in details):
        return problem_response(request, status=400, code="bad_request", detail="Некорректный JSON")
    return problem_response(
        request,
        status=422,
        code="validation_error",
        detail=ValidationFailed.detail,
        errors=[_field_error(d) for d in details],
    )


async def http_error_handler(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(StarletteHTTPException, exc)
    code, detail = _HTTP_CODES.get(exc.status_code, ("internal_error", "Ошибка"))
    return problem_response(request, status=exc.status_code, code=code, detail=detail)


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    get_logger().error("unhandled_error", path=request.url.path, exc_info=exc)
    return problem_response(request, status=500, code="internal_error", detail="Внутренняя ошибка")


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
