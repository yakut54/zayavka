import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.main import create_app
from app.max.webhook import FALLBACK_WINDOW_S, MAX_BODY_BYTES, process_update
from app.settings import Settings
from tests.conftest import make_settings

SECRET = "hook-secret-0123456789"
URL = "/api/v1/max/webhook"
HEADERS = {"X-Max-Bot-Api-Secret": SECRET}


@pytest.fixture
def settings(pg_url: str) -> Settings:
    return make_settings(pg_url, max_webhook_secret=SECRET)


def bot_started(user_id: int = 4242, **extra: Any) -> dict[str, Any]:
    return {
        "update_type": "bot_started",
        "timestamp": 1_700_000_000_000,
        "chat_id": 1,
        "user": {"user_id": user_id, "first_name": "Анна", "is_bot": False},
        **extra,
    }


def message_created(
    user_id: int = 4242, *, chat_type: str = "dialog", is_bot: bool = False, text_: str = "привет"
) -> dict[str, Any]:
    return {
        "update_type": "message_created",
        "timestamp": 1_700_000_000_000,
        "message": {
            "sender": {"user_id": user_id, "first_name": "Анна", "is_bot": is_bot},
            "recipient": {"chat_type": chat_type, "chat_id": 5, "user_id": 99},
            "timestamp": 1_700_000_000_000,
            "body": {"mid": "m1", "seq": 1, "text": text_},
        },
    }


async def post(client: AsyncClient, payload: Any, headers: dict[str, str] = HEADERS) -> Any:
    content = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return await client.post(URL, content=content, headers=headers)


async def tasks(engine: AsyncEngine) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT kind, channel, status, payload, dedupe_key FROM notification_outbox")
        )
        return [dict(r._mapping) for r in result]


async def test_requests_without_valid_secret_are_rejected(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    for headers in ({}, {"X-Max-Bot-Api-Secret": "wrong"}, {"X-Max-Bot-Api-Secret": ""}):
        response = await post(client, bot_started(), headers)
        assert response.status_code == 401
    assert await tasks(engine) == []
    async with engine.connect() as conn:  # тело не разбиралось и не запоминалось
        assert (await conn.execute(text("SELECT count(*) FROM max_updates"))).scalar_one() == 0


async def test_webhook_is_disabled_without_configured_secret(
    engine: AsyncEngine, pg_url: str
) -> None:
    application = create_app(make_settings(pg_url))
    async with application.router.lifespan_context(application):
        transport = ASGITransport(app=application)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            assert (await post(c, bot_started(), {"X-Max-Bot-Api-Secret": ""})).status_code == 401


async def test_bot_started_creates_one_welcome_task(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    response = await post(client, bot_started(), HEADERS)
    assert response.status_code == 200 and response.json() == {"ok": True}
    again = await post(client, bot_started(), HEADERS)  # тот же MAX повторяет доставку
    assert again.status_code == 200
    rows = await tasks(engine)
    assert len(rows) == 1
    assert (rows[0]["kind"], rows[0]["channel"], rows[0]["status"]) == (
        "bot_welcome",
        "max_user",
        "pending",
    )
    assert rows[0]["payload"] == {"user_id": 4242, "variant": "welcome"}


async def test_different_users_get_their_own_welcome(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    await post(client, bot_started(1))
    await post(client, bot_started(2))
    assert sorted(r["payload"]["user_id"] for r in await tasks(engine)) == [1, 2]


async def test_message_gets_a_short_reply_at_most_once_per_window(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    await post(client, message_created(text_="первое"))
    await post(client, message_created(text_="второе"))  # другое тело, то же окно
    rows = await tasks(engine)
    assert len(rows) == 1 and rows[0]["payload"]["variant"] == "fallback"
    assert rows[0]["dedupe_key"].startswith("fallback:4242:")
    await post(client, message_created(user_id=5))
    assert len(await tasks(engine)) == 2


async def test_next_window_allows_another_reply(engine: AsyncEngine) -> None:
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime(2030, 1, 7, 12, 0, tzinfo=UTC)
    first = json.dumps(message_created(text_="a")).encode()
    second = json.dumps(message_created(text_="b")).encode()
    third = json.dumps(message_created(text_="c")).encode()
    assert await process_update(sessionmaker, first, now) == "fallback"
    assert await process_update(sessionmaker, second, now + timedelta(seconds=30)) == "fallback"
    assert (
        await process_update(sessionmaker, third, now + timedelta(seconds=FALLBACK_WINDOW_S))
        == "fallback"
    )
    assert len(await tasks(engine)) == 2  # третье — уже в новом окне


@pytest.mark.parametrize(
    "payload",
    [
        message_created(chat_type="chat"),
        message_created(chat_type="channel"),
        message_created(is_bot=True),
        {**message_created(), "message": {**message_created()["message"], "sender": None}},
        {"update_type": "message_edited", "timestamp": 1},
        {"update_type": "something_new", "timestamp": 1},
        {**bot_started(), "user": {"user_id": 7, "first_name": "Бот", "is_bot": True}},
    ],
)
async def test_other_events_are_acknowledged_without_action(
    client: AsyncClient, engine: AsyncEngine, payload: dict[str, Any]
) -> None:
    assert (await post(client, payload)).status_code == 200
    assert await tasks(engine) == []


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"[]",
        b'{"no_type": true}',
        json.dumps({"update_type": "bot_started"}).encode(),
        json.dumps({"update_type": "message_created", "message": {}}).encode(),
        json.dumps({"update_type": "bot_started", "user": {"user_id": "abc"}}).encode(),
        b"",
    ],
)
async def test_unparsable_or_malformed_body_still_returns_200(
    client: AsyncClient, engine: AsyncEngine, body: bytes
) -> None:
    assert (await post(client, body)).status_code == 200
    assert await tasks(engine) == []


async def test_oversized_body_is_dropped_with_200(client: AsyncClient, engine: AsyncEngine) -> None:
    body = json.dumps(bot_started(extra="x" * (MAX_BODY_BYTES + 10))).encode()
    assert len(body) > MAX_BODY_BYTES
    assert (await post(client, body)).status_code == 200
    assert await tasks(engine) == []


async def test_processing_error_does_not_break_the_response(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    async with engine.begin() as conn:  # ломаем БД-часть: выходит исключение внутри обработчика
        await conn.execute(text("ALTER TABLE notification_outbox RENAME TO outbox_broken"))
    try:
        assert (await post(client, bot_started())).status_code == 200
    finally:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE outbox_broken RENAME TO notification_outbox"))


async def test_webhook_is_not_part_of_openapi(client: AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()
    assert not [p for p in schema["paths"] if "webhook" in p]
