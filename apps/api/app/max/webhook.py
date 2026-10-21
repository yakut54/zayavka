"""Разбор событий вебхука бота. Сообщения не отправляются здесь — только задачи outbox."""

import hashlib
import json
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.logging import get_logger

MAX_BODY_BYTES = 256 * 1024
FALLBACK_WINDOW_S = 600  # на один диалог — не чаще одного ответа за 10 минут

_REMEMBER = text(
    "INSERT INTO max_updates (body_sha256) VALUES (:h) ON CONFLICT DO NOTHING RETURNING 1"
)
_ENQUEUE = text(
    """
    INSERT INTO notification_outbox (kind, channel, payload, dedupe_key)
    VALUES ('bot_welcome', 'max_user', CAST(:payload AS jsonb), :key)
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    """
)


async def process_update(
    sessionmaker: async_sessionmaker[AsyncSession], body: bytes, now: datetime
) -> str:
    """Возвращает, что сделано: duplicate | welcome | fallback | ignored | invalid."""
    digest = hashlib.sha256(body).digest()
    async with sessionmaker() as session, session.begin():
        if (await session.execute(_REMEMBER, {"h": digest})).first() is None:
            return "duplicate"
        try:
            update = json.loads(body)
            kind = update["update_type"]
        except ValueError, KeyError, TypeError:
            get_logger().error("max_webhook_unparsable")
            return "invalid"
        try:
            return await _dispatch(session, kind, update, now)
        except KeyError, ValueError, TypeError, AttributeError:
            get_logger().error("max_webhook_malformed", update_type=str(kind)[:64])
            return "invalid"


async def _dispatch(session: AsyncSession, kind: str, update: dict[str, Any], now: datetime) -> str:
    if kind == "bot_started":
        user = update["user"]
        if user.get("is_bot"):
            return "ignored"
        await _enqueue(session, int(user["user_id"]), "welcome", None)
        return "welcome"
    if kind == "message_created":
        message = update["message"]
        sender = message.get("sender")
        if sender is None or sender.get("is_bot") or message["recipient"]["chat_type"] != "dialog":
            return "ignored"
        user_id = int(sender["user_id"])
        window = int(now.timestamp()) // FALLBACK_WINDOW_S
        await _enqueue(session, user_id, "fallback", f"fallback:{user_id}:{window}")
        return "fallback"
    return "ignored"


async def _enqueue(session: AsyncSession, user_id: int, variant: str, key: str | None) -> None:
    payload = json.dumps({"user_id": user_id, "variant": variant})
    await session.execute(_ENQUEUE, {"payload": payload, "key": key})
