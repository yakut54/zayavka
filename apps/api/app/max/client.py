"""HTTP-клиент Bot API MAX (dev.max.ru/docs-api, схема github.com/max-messenger/api-schema)."""

import asyncio
import ssl
import time
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import httpx

DEFAULT_RPS = 20
DEFAULT_TIMEOUT_S = 10.0
TEXT_LIMIT = 4000
# Типы событий, которые нужны проекту: старт диалога и текст от клиента.
UPDATE_TYPES = ("bot_started", "message_created")


class MaxApiError(Exception):
    """Ошибка Bot API. `retryable` — стоит ли повторить позже (429, 5xx, сеть)."""

    def __init__(
        self, message: str, *, status: int | None = None, code: str | None = None, retryable: bool
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.retryable = retryable


class MaxAuthError(MaxApiError):
    """401: токен неверен или отозван — повторять бессмысленно."""


class TokenBucket:
    """Ограничитель скорости: не больше `rate` запросов в секунду в среднем."""

    def __init__(self, rate: float, *, burst: int | None = None) -> None:
        self._rate = rate
        self._capacity = float(burst if burst is not None else max(1, int(rate)))
        self._tokens = self._capacity
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                self._tokens = min(
                    self._capacity, self._tokens + (now - self._updated) * self._rate
                )
                self._updated = now
                if self._tokens >= 1:
                    self._tokens -= 1
                    return
                await asyncio.sleep((1 - self._tokens) / self._rate)


def build_ssl_context(ca_bundle: Path | None) -> ssl.SSLContext | bool:
    """Проверка сертификата всегда включена; корень Минцифры добавляется в доверенные."""
    if ca_bundle is None:
        return True
    return ssl.create_default_context(cafile=str(ca_bundle))


class MaxClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        client: httpx.AsyncClient | None = None,
        rps: float = DEFAULT_RPS,
        ca_bundle: Path | None = None,
    ) -> None:
        self._token = token
        self._bucket = TokenBucket(rps)
        self._client = client or httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=DEFAULT_TIMEOUT_S,
            verify=build_ssl_context(ca_bundle),
        )
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        await self._bucket.acquire()
        try:
            response = await self._client.request(
                method,
                path,
                params=params,
                json=json,
                headers={"Authorization": self._token},
            )
        except httpx.TimeoutException as exc:
            raise MaxApiError("timeout", retryable=True) from exc
        except httpx.TransportError as exc:
            raise MaxApiError(f"transport error: {type(exc).__name__}", retryable=True) from exc
        if response.is_success:
            return response.json() if response.content else {}
        code, message = _error_details(response)
        text = f"{response.status_code} {code or ''} {message or ''}".strip()
        if response.status_code == 401:
            raise MaxAuthError(text, status=401, code=code, retryable=False)
        retryable = response.status_code == 429 or response.status_code >= 500
        raise MaxApiError(text, status=response.status_code, code=code, retryable=retryable)

    async def send_message(
        self, user_id: int, text: str, keyboard: dict[str, Any] | None = None
    ) -> None:
        """Простой текст (без `format`): данные клиента не интерпретируются как разметка."""
        body: dict[str, Any] = {"text": text[:TEXT_LIMIT]}
        if keyboard is not None:
            body["attachments"] = [keyboard]
        await self._request("POST", "/messages", params={"user_id": user_id}, json=body)

    async def get_me(self) -> dict[str, Any]:
        result: dict[str, Any] = await self._request("GET", "/me")
        return result

    async def get_subscriptions(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/subscriptions")
        subscriptions: list[dict[str, Any]] = data.get("subscriptions", [])
        return subscriptions

    async def subscribe(
        self, url: str, secret: str, update_types: Sequence[str] = UPDATE_TYPES
    ) -> None:
        await self._request(
            "POST",
            "/subscriptions",
            json={"url": url, "secret": secret, "update_types": list(update_types)},
        )

    async def unsubscribe(self, url: str) -> None:
        await self._request("DELETE", "/subscriptions", params={"url": url})


def _error_details(response: httpx.Response) -> tuple[str | None, str | None]:
    try:
        data = response.json()
    except ValueError:
        return None, None
    if isinstance(data, dict):
        code, message = data.get("code"), data.get("message")
        return (str(code) if code else None, str(message) if message else None)
    return None, None
