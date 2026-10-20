import re
import time
import uuid

import structlog
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.logging import get_logger

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
QUIET_PATHS = frozenset({"/api/v1/healthz", "/api/v1/readyz"})


class RequestIdMiddleware:
    """Берёт X-Request-ID или генерирует; кладёт в structlog-контекст и в ответ."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = next(
            (v.decode("latin-1") for k, v in scope["headers"] if k == b"x-request-id"), None
        )
        request_id = incoming if incoming and _REQUEST_ID_RE.match(incoming) else str(uuid.uuid7())
        scope.setdefault("state", {})["request_id"] = request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            structlog.contextvars.clear_contextvars()


class AccessLogMiddleware:
    """Метод, путь, статус, длительность. Без тела, query и персональных данных."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 500

        async def send_capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_capture)
        finally:
            path: str = scope["path"]
            log = get_logger()
            emit = log.debug if path in QUIET_PATHS else log.info
            emit(
                "request",
                method=scope["method"],
                path=path,
                status=status,
                duration_ms=round((time.perf_counter() - started) * 1000, 1),
            )
