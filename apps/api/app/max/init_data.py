"""Проверка и подпись `initData` мини-приложения MAX (dev.max.ru/docs/webapps/validation)."""

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, unquote

from app.domain.errors import MaxInitDataExpired, MaxInitDataInvalid

MAX_FUTURE_SKEW = timedelta(minutes=5)


@dataclass(frozen=True)
class MaxUser:
    id: int
    first_name: str
    is_demo: bool = False


def _secret_key(bot_token: str) -> bytes:
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def _signature(fields: dict[str, str], bot_token: str) -> str:
    launch_params = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    return hmac.new(_secret_key(bot_token), launch_params.encode(), hashlib.sha256).hexdigest()


def parse_fields(raw: str) -> tuple[dict[str, str], str]:
    """Пары `key=value` (значения декодируются, `+` остаётся плюсом) и значение `hash`.

    Любой ключ — ровно один раз, `hash` обязателен; иначе `MaxInitDataInvalid`.
    """
    fields: dict[str, str] = {}
    for pair in raw.split("&"):
        key, separator, value = pair.partition("=")
        if not separator or not key or key in fields:
            raise MaxInitDataInvalid
        fields[key] = unquote(value)
    received = fields.pop("hash", None)
    if not received:
        raise MaxInitDataInvalid
    return fields, received


def sign(fields: dict[str, str], bot_token: str) -> str:
    """Собирает строку `initData` с подписью — для демо-режима и тестов."""
    signed = {**fields, "hash": _signature(fields, bot_token)}
    return "&".join(f"{key}={quote(value, safe='')}" for key, value in signed.items())


def verify(raw: str, bot_token: str, *, now: datetime, ttl: timedelta) -> MaxUser:
    fields, received = parse_fields(raw)
    expected = _signature(fields, bot_token)
    if not hmac.compare_digest(expected.encode(), received.encode()):
        raise MaxInitDataInvalid
    try:
        auth_date = datetime.fromtimestamp(int(fields["auth_date"]), UTC)
        user = json.loads(fields["user"])
        user_id, first_name = int(user["id"]), str(user.get("first_name", ""))
    except (KeyError, ValueError, TypeError, OverflowError, AttributeError) as exc:
        raise MaxInitDataInvalid from exc
    if auth_date > now + MAX_FUTURE_SKEW:
        raise MaxInitDataInvalid
    if now - auth_date > ttl:
        raise MaxInitDataExpired
    return MaxUser(id=user_id, first_name=first_name)
