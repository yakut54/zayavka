import hmac
from datetime import UTC, datetime
from typing import cast

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.domain.errors import Unauthenticated
from app.logging import get_logger
from app.max.webhook import MAX_BODY_BYTES, process_update
from app.settings import Settings

SECRET_HEADER = "X-Max-Bot-Api-Secret"  # noqa: S105 — имя заголовка, не секрет

router = APIRouter(prefix="/max", tags=["max-webhook"], include_in_schema=False)


async def _read_limited(request: Request) -> bytes | None:
    """Тело не больше 256 КБ; больше — None (молча отбрасываем, ответ всё равно 200)."""
    size = int(request.headers.get("content-length") or 0)
    if size > MAX_BODY_BYTES:
        return None
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_BODY_BYTES:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/webhook")
async def webhook(request: Request) -> JSONResponse:
    """Всегда 200 при верном секрете: иначе MAX повторяет доставку и через 8 часов отпишет бота."""
    settings = cast(Settings, request.app.state.settings)
    secret = settings.max_webhook_secret
    provided = request.headers.get(SECRET_HEADER, "")
    if secret is None or not hmac.compare_digest(
        provided.encode(), secret.get_secret_value().encode()
    ):
        raise Unauthenticated
    body = await _read_limited(request)
    if body is None:
        get_logger().error("max_webhook_too_large")
    else:
        try:
            await process_update(request.app.state.sessionmaker, body, datetime.now(UTC))
        except Exception:
            get_logger().exception("max_webhook_failed")
    return JSONResponse({"ok": True})
