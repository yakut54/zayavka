import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app import cli
from app.booking.service import BookingService, Client, NewBooking
from app.catalog import load_business
from app.logging import get_logger
from app.max import ops
from app.max.client import MaxClient
from app.notifications import build_channels
from app.notifications.booking import BookingDispatcher
from app.notifications.channels.email import EmailChannel
from app.notifications.channels.log import LogChannel
from app.services.maintenance import run_maintenance
from app.services.notifications import process_batch
from app.settings import Settings
from tests.conftest import make_settings
from tests.integration.test_booking_service import CATALOG, Clock, at, seed_resource

SERVICES_JSON = Path(__file__).parents[2] / "services.json"
USER = 4242


class Recorder:
    """Имитация Bot API: запоминает запросы, отвечает заданным статусом."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.status = 200
        self.fail_users: set[int] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        user = int(request.url.params.get("user_id", 0))
        status = 403 if user in self.fail_users else self.status
        return httpx.Response(status, json={"code": "x", "message": "m"} if status >= 400 else {})

    def bodies(self) -> list[dict[str, Any]]:
        return [json.loads(r.content) for r in self.requests]


@pytest.fixture
def api() -> Recorder:
    return Recorder()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def settings(pg_url: str) -> Settings:
    return make_settings(pg_url, rate_limit_booking="100/600", max_bot_token="1:T")


@pytest.fixture
def svc(engine: AsyncEngine, settings: Settings, clock: Clock) -> BookingService:
    return BookingService(
        async_sessionmaker(engine, expire_on_commit=False),
        settings,
        catalog=CATALOG,
        consent_text_sha256=b"\x01" * 32,
        clock=clock,
    )


def make_dispatcher(
    settings: Settings, api: Recorder | None, clock: Clock, channels: dict[str, Any] | None = None
) -> BookingDispatcher:
    client = (
        MaxClient(
            "https://platform-api2.max.ru",
            "1:T",
            client=httpx.AsyncClient(
                base_url="https://platform-api2.max.ru", transport=httpx.MockTransport(api.handler)
            ),
        )
        if api
        else None
    )
    return BookingDispatcher(
        settings,
        load_business(SERVICES_JSON),
        channels if channels is not None else build_channels(settings),
        max_client=client,
        clock=clock,
    )


async def run(engine: AsyncEngine, dispatcher: BookingDispatcher | None, settings: Settings) -> int:
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        return await process_batch(session, build_channels(settings), {}, dispatcher=dispatcher)


async def outbox(engine: AsyncEngine) -> dict[str, dict[str, Any]]:
    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT kind, channel, status, last_error, attempts FROM notification_outbox")
        )
        return {f"{r.kind}:{r.channel}": dict(r._mapping) for r in result}


def new(starts_at: datetime, rid: uuid.UUID, user: int | None = USER) -> NewBooking:
    return NewBooking(
        service_slug="tires",
        resource_id=rid,
        starts_at=starts_at,
        client=Client("Иван", "+79991234567", "manual", user),
        source="max",
        policy_version="2026-10-20",
        ip_hash=b"\x02" * 32,
    )


async def test_confirmation_goes_to_client_and_owner(
    engine: AsyncEngine, svc: BookingService, api: Recorder, settings: Settings, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    clock.now = at(10) - timedelta(hours=3)  # напоминания по времени ещё не наступили
    await svc.create(new(at(10), rid))
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE notification_outbox SET next_attempt_at = now() + interval '1 day'"
                " WHERE kind LIKE 'booking_reminder%'"
            )
        )
    processed = await run(engine, make_dispatcher(settings, api, clock), settings)
    assert processed == 2  # подтверждение клиенту и письмо-лог владельцу
    states = await outbox(engine)
    assert states["booking_confirmed_client:max_user"]["status"] == "sent"
    assert states["booking_created_owner:log"]["status"] == "sent"
    assert states["booking_reminder_2h:max_user"]["status"] == "pending"
    [request] = api.requests
    assert request.url.path == "/messages" and request.url.params["user_id"] == str(USER)
    assert request.headers["Authorization"] == "1:T"
    body = api.bodies()[0]
    assert body["text"].startswith("Вы записаны ✅\nШиномонтаж")
    button = body["attachments"][0]["payload"]["buttons"][0][0]
    assert button == {
        "type": "open_app",
        "text": "Мои записи",
        "web_app": "example_bot",
        "payload": "my",
    }


async def test_due_reminder_is_sent_and_cancelled_booking_is_not_reminded(
    engine: AsyncEngine, svc: BookingService, api: Recorder, settings: Settings, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    kept = (await svc.create(new(at(10), rid))).booking
    cancelled = (await svc.create(new(at(14), rid, user=77))).booking
    await svc.cancel(cancelled.id, 77, 1)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE notification_outbox SET status = 'sent' WHERE kind <> 'booking_reminder_24h'"
            )
        )
        # задача напоминания об отменённой записи осталась pending — вторая линия защиты §8.2
        await conn.execute(
            text(
                "UPDATE notification_outbox SET status = 'pending', next_attempt_at = now()"
                " WHERE kind = 'booking_reminder_24h'"
            )
        )
    clock.now = at(10) - timedelta(hours=24)
    await run(engine, make_dispatcher(settings, api, clock), settings)
    texts = [b["text"] for b in api.bodies()]
    assert len(texts) == 1 and texts[0].startswith("Напоминаем: завтра в 10:00")
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT payload ->> 'booking_id' AS b, status, last_error FROM notification_outbox"
                    " WHERE kind = 'booking_reminder_24h'"
                )
            )
        ).all()
    by_booking = {str(r.b): (r.status, r.last_error) for r in rows}
    assert by_booking[str(kept.id)] == ("sent", None)
    assert by_booking[str(cancelled.id)][0] == "cancelled"


@pytest.mark.parametrize(
    ("user", "reason"),
    [(None, "no_max_user"), (-5, "demo_user")],
)
async def test_client_messages_are_skipped_for_users_who_cannot_receive(
    engine: AsyncEngine,
    svc: BookingService,
    api: Recorder,
    settings: Settings,
    clock: Clock,
    user: int | None,
    reason: str,
) -> None:
    rid = await seed_resource(engine)
    created = await svc.create(new(at(10), rid, user))
    if user is None:  # у записи из админки клиентских задач нет — добавляем вручную
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO notification_outbox (kind, channel, payload)"
                    " VALUES ('booking_confirmed_client', 'max_user', CAST(:p AS jsonb))"
                ),
                {"p": json.dumps({"booking_id": str(created.booking.id)})},
            )
    await run(engine, make_dispatcher(settings, api, clock), settings)
    states = await outbox(engine)
    assert states["booking_confirmed_client:max_user"]["status"] == "cancelled"
    assert states["booking_confirmed_client:max_user"]["last_error"] == reason
    assert api.requests == []


async def test_without_bot_token_client_tasks_are_cancelled(
    engine: AsyncEngine, svc: BookingService, settings: Settings, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    await svc.create(new(at(10), rid))
    await run(engine, make_dispatcher(settings, None, clock), settings)
    states = await outbox(engine)
    assert states["booking_confirmed_client:max_user"]["last_error"] == "max_not_configured"
    assert states["booking_created_owner:log"]["status"] == "sent"


async def test_dispatcher_missing_means_tasks_are_cancelled(
    engine: AsyncEngine, svc: BookingService, settings: Settings
) -> None:
    rid = await seed_resource(engine)
    await svc.create(new(at(10), rid))
    await run(engine, None, settings)
    states = await outbox(engine)
    for key in ("booking_confirmed_client:max_user", "booking_created_owner:log"):
        assert states[key]["status"] == "cancelled"
        assert states[key]["last_error"] == "bookings_not_configured"


@pytest.mark.parametrize(
    ("status", "final", "attempts"),
    [
        (401, "failed", 1),
        (403, "failed", 1),
        (400, "failed", 1),
        (429, "pending", 1),
        (500, "pending", 1),
    ],
)
async def test_api_errors_decide_between_retry_and_failure(
    engine: AsyncEngine,
    svc: BookingService,
    api: Recorder,
    settings: Settings,
    clock: Clock,
    status: int,
    final: str,
    attempts: int,
) -> None:
    rid = await seed_resource(engine)
    await svc.create(new(at(10), rid))
    api.status = status
    await run(engine, make_dispatcher(settings, api, clock), settings)
    task = (await outbox(engine))["booking_confirmed_client:max_user"]
    assert (task["status"], task["attempts"]) == (final, attempts)
    assert task["last_error"].startswith("MaxApiError") or task["last_error"].startswith(
        "MaxAuthError"
    )


async def test_failed_user_does_not_block_other_tasks(
    engine: AsyncEngine, svc: BookingService, api: Recorder, settings: Settings, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    await svc.create(new(at(10), rid, user=1))
    await svc.create(new(at(12), rid, user=2))
    api.fail_users = {1}
    await run(engine, make_dispatcher(settings, api, clock), settings)
    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT b.max_user_id AS u, o.status FROM notification_outbox o"
                    " JOIN bookings b ON b.id = (o.payload ->> 'booking_id')::uuid"
                    " WHERE o.kind = 'booking_confirmed_client'"
                )
            )
        ).all()
    assert {r.u: r.status for r in rows} == {1: "failed", 2: "sent"}


async def test_welcome_message_has_book_button(
    engine: AsyncEngine, api: Recorder, settings: Settings, clock: Clock
) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO notification_outbox (kind, channel, payload) VALUES"
                " ('bot_welcome', 'max_user', CAST(:a AS jsonb)),"
                " ('bot_welcome', 'max_user', CAST(:b AS jsonb))"
            ),
            {
                "a": json.dumps({"user_id": 5, "variant": "welcome"}),
                "b": json.dumps({"user_id": 6, "variant": "fallback"}),
            },
        )
    await run(engine, make_dispatcher(settings, api, clock), settings)
    texts = {r.url.params["user_id"]: json.loads(r.content) for r in api.requests}
    assert texts["5"]["text"].startswith("Здравствуйте!") and "Гараж 24" in texts["5"]["text"]
    assert texts["6"]["text"] == "Я умею только записывать — нажмите кнопку ниже."
    button = texts["5"]["attachments"][0]["payload"]["buttons"][0][0]
    assert button["text"] == "Записаться" and "payload" not in button


async def test_unknown_kind_and_missing_booking_are_cancelled(
    engine: AsyncEngine, api: Recorder, settings: Settings, clock: Clock
) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO notification_outbox (kind, channel, payload) VALUES"
                " ('booking_cancelled_owner', 'log', CAST(:p AS jsonb))"
            ),
            {"p": json.dumps({"booking_id": str(uuid.uuid4())})},
        )
    await run(engine, make_dispatcher(settings, api, clock), settings)
    task = (await outbox(engine))["booking_cancelled_owner:log"]
    assert (task["status"], task["last_error"]) == ("cancelled", "booking_not_found")


async def test_owner_gets_cancellation_after_client_cancels(
    engine: AsyncEngine, svc: BookingService, api: Recorder, settings: Settings, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    booking = (await svc.create(new(at(10), rid))).booking
    await svc.cancel(booking.id, USER, 1)
    await run(engine, make_dispatcher(settings, api, clock), settings)
    states = await outbox(engine)
    assert states["booking_cancelled_owner:log"]["status"] == "sent"
    assert api.requests == []  # клиенту об отмене им самим не пишем, задачи подтверждения сняты


async def test_email_and_log_channels_accept_owner_messages(
    engine: AsyncEngine, svc: BookingService, settings: Settings, clock: Clock
) -> None:
    from app.notifications.booking import load_booking_message

    rid = await seed_resource(engine)
    booking = (await svc.create(new(at(10), rid))).booking
    async with async_sessionmaker(engine)() as session:
        message = await load_booking_message(
            session,
            booking.id,
            settings=settings,
            business=load_business(SERVICES_JSON),
            now=datetime(2030, 1, 1, tzinfo=UTC),
        )
    assert message is not None and message.admin_url.endswith(f"/bookings/{booking.id}")
    smtp = make_settings(settings.sqlalchemy_url, smtp_host="mail", smtp_from="Заявки <n@e.ru>")
    mail = EmailChannel(smtp).build_booking_message("booking_cancelled_owner", message, "тело")
    assert mail["Subject"] == f"Отмена записи № {message.public_number}"
    assert mail.get_content().strip() == "тело" and mail["To"] == "owner@example.ru"
    created = EmailChannel(smtp).build_booking_message("booking_created_owner", message, "x")
    assert created["Subject"].startswith("Новая запись")
    await LogChannel().send_booking_owner("booking_created_owner", message, "x")
    assert get_logger() is not None


# ---------- обслуживание ----------


async def test_maintenance_completes_anonymizes_and_cleans(
    engine: AsyncEngine, svc: BookingService, settings: Settings, clock: Clock
) -> None:
    rid = await seed_resource(engine)
    old = (await svc.create(new(at(10), rid, user=1))).booking
    fresh = (await svc.create(new(at(12), rid, user=2))).booking
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE bookings SET starts_at = now() - interval '14 hours',"
                " ends_at = now() - interval '13 hours',"
                " blocked = tstzrange(now() - interval '14 hours', now() - interval '13 hours'),"
                " created_at = now() - interval '400 days', comment = 'секрет' WHERE id = :i"
            ),
            {"i": old.id},
        )
        await conn.execute(
            text(
                "INSERT INTO max_updates (body_sha256, received_at)"
                " VALUES ('\\x01', now() - interval '8 days'), ('\\x02', now())"
            )
        )
    async with async_sessionmaker(engine)() as session:
        result = await run_maintenance(session, 365)
    assert (result.bookings_completed, result.bookings_anonymized, result.max_updates_deleted) == (
        1,
        1,
        1,
    )
    async with engine.connect() as conn:
        rows = {
            r.id: r
            for r in await conn.execute(
                text(
                    "SELECT id, status, client_name, client_phone_e164, max_user_id, comment,"
                    " anonymized_at FROM bookings"
                )
            )
        }
        events = (
            (
                await conn.execute(
                    text("SELECT payload FROM booking_events WHERE type = 'status_changed'")
                )
            )
            .scalars()
            .all()
        )
    assert rows[old.id].status == "completed" and rows[old.id].client_name == "Удалено"
    assert rows[old.id].max_user_id is None and rows[old.id].comment is None
    assert (
        rows[old.id].client_phone_e164 == "+70000000000" and rows[old.id].anonymized_at is not None
    )
    assert rows[fresh.id].status == "confirmed" and rows[fresh.id].client_name == "Иван"
    assert events == [{"status": "completed", "auto": True}]


# ---------- CLI и сопровождение ----------


def mock_api(handler: Any) -> MaxClient:
    return MaxClient(
        "https://platform-api2.max.ru",
        "1:T",
        client=httpx.AsyncClient(
            base_url="https://platform-api2.max.ru", transport=httpx.MockTransport(handler)
        ),
    )


async def test_subscribe_recreates_existing_subscription(pg_url: str) -> None:
    settings = make_settings(pg_url, max_bot_token="1:T", max_webhook_secret="secret_abcdef")
    url = "http://site.test/api/v1/max/webhook"
    calls: list[tuple[str, str, dict[str, Any]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else {}
        calls.append((request.method, request.url.path, {**dict(request.url.params), **body}))
        if request.method == "GET":
            return httpx.Response(200, json={"subscriptions": [{"url": url, "time": 1}]})
        return httpx.Response(200, json={"success": True})

    assert ops.webhook_url(settings) == url
    assert await ops.subscribe(mock_api(handler), settings) == "переподписан"
    assert [(m, p) for m, p, _ in calls] == [
        ("GET", "/subscriptions"),
        ("DELETE", "/subscriptions"),
        ("POST", "/subscriptions"),
    ]
    assert calls[2][2]["secret"] == "secret_abcdef" and calls[2][2]["url"] == url

    calls.clear()

    def empty(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, {}))
        return httpx.Response(200, json={"subscriptions": []} if request.method == "GET" else {})

    assert await ops.subscribe(mock_api(empty), settings) == "подписан"
    assert [m for m, _, _ in calls] == ["GET", "POST"]


async def test_check_reports_problems(pg_url: str) -> None:
    settings = make_settings(pg_url, max_bot_token="1:T", max_webhook_secret="secret_abcdef")
    url = ops.webhook_url(settings)

    def healthy(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/me":
            return httpx.Response(200, json={"username": "example_bot"})
        return httpx.Response(200, json={"subscriptions": [{"url": url, "time": 1}]})

    report = await ops.check(mock_api(healthy), settings)
    assert report.ok and report.bot_username == "example_bot" and report.subscribed

    def not_subscribed(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/me":
            return httpx.Response(200, json={"username": "example_bot"})
        return httpx.Response(200, json={"subscriptions": []})

    report = await ops.check(mock_api(not_subscribed), settings)
    assert not report.ok and "max-subscribe" in report.problems[0]

    report = await ops.check(mock_api(lambda r: httpx.Response(401, json={})), settings)
    assert not report.token_valid and not report.ok

    def subs_fail(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/me":
            return httpx.Response(200, json={})
        return httpx.Response(500, json={})

    assert "подписки" in (await ops.check(mock_api(subs_fail), settings)).problems[0]


def test_require_config_names_missing_variables(pg_url: str) -> None:
    with pytest.raises(SystemExit, match="MAX_WEBHOOK_SECRET"):
        ops.require_config(make_settings(pg_url, max_bot_token="1:T"))
    ok = ops.require_config(make_settings(pg_url, max_bot_token="1:T", max_webhook_secret="s" * 8))
    assert ok == ("1:T", "s" * 8)
    assert ops.webhook_url(make_settings(pg_url, max_webhook_url="https://x/y")) == "https://x/y"


def test_cli_max_commands_require_token(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], pg_url: str
) -> None:
    monkeypatch.setattr(cli, "get_settings", lambda: make_settings(pg_url))
    for command in ("max-subscribe", "max-check"):
        assert cli.main([command]) == 1
        assert "MAX_BOT_TOKEN" in capsys.readouterr().err


def test_cli_max_check_and_subscribe_use_the_api(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], pg_url: str
) -> None:
    settings = make_settings(pg_url, max_bot_token="1:T", max_webhook_secret="secret_abcdef")
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    url = ops.webhook_url(settings)
    state = {"subscribed": False}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/me":
            return httpx.Response(200, json={"username": "example_bot"})
        if request.method == "POST":
            state["subscribed"] = True
        subscriptions = [{"url": url, "time": 1}] if state["subscribed"] else []
        return httpx.Response(200, json={"subscriptions": subscriptions})

    transport = httpx.MockTransport(handler)
    original = MaxClient.__init__

    def patched(self: MaxClient, base: str, token: str, **kwargs: Any) -> None:
        kwargs["client"] = httpx.AsyncClient(base_url=base, transport=transport)
        original(self, base, token, **kwargs)

    monkeypatch.setattr(MaxClient, "__init__", patched)
    assert cli.main(["max-check"]) == 1  # подписки ещё нет
    assert "max-subscribe" in capsys.readouterr().err
    assert cli.main(["max-subscribe"]) == 0
    assert url in capsys.readouterr().out
    assert cli.main(["max-check"]) == 0
    out = capsys.readouterr().out
    assert "example_bot" in out and "1:T" not in out  # токен не печатается


async def test_max_owner_chat_channel_posts_text() -> None:
    from app.notifications.booking import BookingMessage
    from app.notifications.channels.max import MaxChannel

    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    channel = MaxChannel("tok", "555", "https://admin.example.ru", client=client)
    message = BookingMessage.__new__(BookingMessage)
    await channel.send_booking_owner("booking_created_owner", message, "Новая запись № 1")
    request = seen[0]
    assert request.url.params["chat_id"] == "555" and request.headers["Authorization"] == "tok"
    assert json.loads(request.content) == {"text": "Новая запись № 1"}

    failing = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    with pytest.raises(httpx.HTTPStatusError):
        await MaxChannel("tok", "555", "https://a", client=failing).send_booking_owner(
            "booking_created_owner", message, "x"
        )
