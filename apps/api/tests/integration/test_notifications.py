import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from testcontainers.core.container import DockerContainer
from testcontainers.core.waiting_utils import wait_for_logs

from app.notifications import build_channels
from app.notifications.base import LeadView
from app.notifications.channels.email import EmailChannel
from app.notifications.channels.log import LogChannel
from app.notifications.channels.max import MaxChannel
from app.services.notifications import BACKOFF_S, process_batch
from app.settings import Settings
from app.worker import run_worker
from tests.conftest import make_settings
from tests.integration.test_leads import URL, payload

TITLES = {"diagnostics": "Компьютерная диагностика"}


class FakeChannel:
    name = "log"

    def __init__(self, *, fail: bool = False, delay: float = 0.0) -> None:
        self.fail = fail
        self.delay = delay
        self.sent: list[LeadView] = []

    async def send_lead_created(self, lead: LeadView) -> None:
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise RuntimeError("smtp down")
        self.sent.append(lead)


async def outbox(session: AsyncSession) -> Any:
    await session.rollback()
    return (await session.execute(text("SELECT * FROM notification_outbox"))).one()


async def make_due(session: AsyncSession) -> None:
    await session.execute(text("UPDATE notification_outbox SET next_attempt_at = now()"))
    await session.commit()


async def seconds_until_retry(session: AsyncSession) -> float:
    return float(
        (
            await session.execute(
                text("SELECT extract(epoch FROM next_attempt_at - now()) FROM notification_outbox")
            )
        ).scalar_one()
    )


@pytest.fixture
def sm(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def test_success_marks_sent(
    client: AsyncClient, session: AsyncSession, sm: async_sessionmaker[AsyncSession]
) -> None:
    await client.post(URL, json=payload(message="Привет"))
    channel = FakeChannel()
    async with sm() as s:
        assert await process_batch(s, {"log": channel}, TITLES) == 1
    row = await outbox(session)
    assert (row.status, row.attempts, row.last_error) == ("sent", 1, None)
    assert row.sent_at is not None
    lead = channel.sent[0]
    assert (lead.public_number, lead.phone_e164, lead.message) == (1, "+79123456789", "Привет")
    assert lead.service_title == "Компьютерная диагностика"
    async with sm() as s:
        assert await process_batch(s, {"log": channel}) == 0


async def test_failure_schedules_backoff_then_fails_after_five(
    client: AsyncClient, session: AsyncSession, sm: async_sessionmaker[AsyncSession]
) -> None:
    await client.post(URL, json=payload())
    channel = FakeChannel(fail=True)
    delays: list[int] = []
    for attempt in range(1, 5):
        async with sm() as s:
            assert await process_batch(s, {"log": channel}) == 1
        row = await outbox(session)
        assert (row.status, row.attempts) == ("pending", attempt)
        assert "smtp down" in row.last_error
        expected = BACKOFF_S[attempt - 1]
        delays.append(expected)
        assert expected - 5 <= await seconds_until_retry(session) <= expected
        async with sm() as s:  # ещё не время — не берётся
            assert await process_batch(s, {"log": channel}) == 0
        await make_due(session)
    assert delays == [60, 300, 900, 3600]

    async with sm() as s:
        assert await process_batch(s, {"log": channel}) == 1
    row = await outbox(session)
    assert (row.status, row.attempts) == ("failed", 5)
    async with sm() as s:
        assert await process_batch(s, {"log": channel}) == 0


async def test_recovery_after_failure(
    client: AsyncClient, session: AsyncSession, sm: async_sessionmaker[AsyncSession]
) -> None:
    await client.post(URL, json=payload())
    async with sm() as s:
        await process_batch(s, {"log": FakeChannel(fail=True)})
    await make_due(session)
    async with sm() as s:
        await process_batch(s, {"log": FakeChannel()})
    row = await outbox(session)
    assert (row.status, row.attempts, row.last_error) == ("sent", 2, None)


async def test_one_failure_does_not_block_others(
    client: AsyncClient, session: AsyncSession, sm: async_sessionmaker[AsyncSession]
) -> None:
    await client.post(URL, json=payload(name="Первый"))
    await client.post(URL, json=payload(name="Второй"))
    await session.execute(
        text(
            "UPDATE notification_outbox SET channel = 'max' WHERE payload->>'lead_id' = ("
            "SELECT id::text FROM leads WHERE name = 'Первый')"
        )
    )
    await session.commit()
    ok = FakeChannel()
    async with sm() as s:
        await process_batch(s, {"log": ok, "max": FakeChannel(fail=True)})
    rows = (
        await session.execute(text("SELECT channel, status FROM notification_outbox ORDER BY 1"))
    ).all()
    assert [tuple(r) for r in rows] == [("log", "sent"), ("max", "pending")]


async def test_parallel_workers_do_not_take_same_task(
    client: AsyncClient, session: AsyncSession, sm: async_sessionmaker[AsyncSession]
) -> None:
    await client.post(URL, json=payload())
    channel = FakeChannel(delay=0.4)

    async def run() -> int:
        async with sm() as s:
            return await process_batch(s, {"log": channel})

    taken = await asyncio.gather(run(), run())
    assert sorted(taken) == [0, 1]
    assert len(channel.sent) == 1


async def test_batch_limited_to_twenty(
    client_factory: Callable[[str], AsyncClient],
    sm: async_sessionmaker[AsyncSession],
    session: AsyncSession,
) -> None:
    for i in range(25):
        await client_factory(f"10.9.0.{i}").post(URL, json=payload())
    channel = FakeChannel()
    async with sm() as s:
        assert await process_batch(s, {"log": channel}) == 20
    async with sm() as s:
        assert await process_batch(s, {"log": channel}) == 5


# --- Анонимизация и обслуживание ------------------------------------------


async def test_anonymize_expired(
    client: AsyncClient, session: AsyncSession, sm: async_sessionmaker[AsyncSession]
) -> None:
    from app.services.maintenance import anonymize_expired

    await client.post(URL, json=payload(name="Старый", message="секрет"))
    await client.post(URL, json=payload(name="Свежий", message="виден"))
    await session.execute(
        text("UPDATE leads SET created_at = now() - interval '400 days' WHERE name = 'Старый'")
    )
    await session.execute(
        text(
            "INSERT INTO lead_events (lead_id, type, payload) SELECT id, 'note_added',"
            " '{\"text\": \"звонил\"}' FROM leads WHERE name = 'Старый'"
        )
    )
    await session.commit()

    async with sm() as s, s.begin():
        assert await anonymize_expired(s, 365) == 1
    rows = (
        await session.execute(
            text(
                "SELECT name, phone_e164, email, message, anonymized_at, status, service_slug"
                " FROM leads ORDER BY public_number"
            )
        )
    ).all()
    old, fresh = rows
    assert (old.name, old.phone_e164, old.email, old.message) == (
        "Удалено",
        "+70000000000",
        None,
        None,
    )
    assert old.anonymized_at is not None
    assert (old.status, old.service_slug) == ("new", "diagnostics")
    assert (fresh.name, fresh.message, fresh.anonymized_at) == ("Свежий", "виден", None)
    note = (
        await session.execute(text("SELECT payload FROM lead_events WHERE type='note_added'"))
    ).scalar_one()
    assert note == {"text": "Удалено"}

    async with sm() as s, s.begin():
        assert await anonymize_expired(s, 365) == 0


async def test_run_maintenance(
    client: AsyncClient, session: AsyncSession, sm: async_sessionmaker[AsyncSession]
) -> None:
    from app.services.maintenance import run_maintenance

    await client.post(URL, json=payload())
    await session.execute(
        text(
            "INSERT INTO rate_limits VALUES ('old', now() - interval '3 days', 1),"
            " ('new', now(), 1)"
        )
    )
    user_id = (
        await session.execute(
            text(
                "INSERT INTO admin_users (email, password_hash) VALUES ('a@b.ru', 'x') RETURNING id"
            )
        )
    ).scalar_one()
    for name, delta in (("expired", -3600), ("valid", 3600)):
        await session.execute(
            text(
                "INSERT INTO admin_sessions (user_id, token_hash, csrf_token_hash, expires_at,"
                " ip_hash, user_agent) VALUES (:u, :t, 'x', now() + make_interval(secs => :d), 'x', 'ua')"
            ),
            {"u": user_id, "t": name.encode(), "d": delta},
        )
    await session.commit()

    async with sm() as s:
        result = await run_maintenance(s, 365)
    assert (result.rate_limits_deleted, result.sessions_deleted, result.leads_anonymized) == (
        1,
        1,
        0,
    )
    left = (await session.execute(text("SELECT bucket FROM rate_limits"))).scalars().all()
    assert "old" not in left


async def test_cli_anonymize_expired(
    client: AsyncClient,
    session: AsyncSession,
    pg_url: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from app import cli

    await client.post(URL, json=payload())
    await session.execute(text("UPDATE leads SET created_at = now() - interval '999 days'"))
    await session.commit()
    monkeypatch.setattr(cli, "get_settings", lambda: make_settings(pg_url))
    assert await asyncio.to_thread(cli.main, ["anonymize-expired"]) == 0
    assert "anonymized: 1" in capsys.readouterr().out


# --- Воркер ---------------------------------------------------------------


async def test_worker_loop_processes_and_stops(
    client: AsyncClient,
    session: AsyncSession,
    sm: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> None:
    await client.post(URL, json=payload())
    channel = FakeChannel()
    stop = asyncio.Event()
    task = asyncio.create_task(
        run_worker(settings, stop, sessionmaker=sm, channels={"log": channel}, idle_sleep_s=0.05)
    )
    for _ in range(100):
        if channel.sent:
            break
        await asyncio.sleep(0.05)
    stop.set()
    await asyncio.wait_for(task, timeout=5)
    assert len(channel.sent) == 1
    assert (await outbox(session)).status == "sent"


async def test_worker_survives_batch_errors(
    session: AsyncSession, settings: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    class BrokenSessionmaker:
        def __call__(self) -> Any:
            raise RuntimeError("db gone")

    stop = asyncio.Event()
    task = asyncio.create_task(
        run_worker(
            settings,
            stop,
            sessionmaker=BrokenSessionmaker(),  # type: ignore[arg-type]
            channels={},
            idle_sleep_s=0.05,
        )
    )
    await asyncio.sleep(0.3)
    stop.set()
    await asyncio.wait_for(task, timeout=5)
    out = capsys.readouterr().out
    assert "batch_failed" in out and "maintenance_failed" in out


# --- Каналы ---------------------------------------------------------------


def lead_view(**overrides: Any) -> LeadView:
    values: dict[str, Any] = {
        "id": uuid.UUID("0192f5c4-0000-7000-8000-000000000001"),
        "public_number": 123,
        "name": "Иван <b>Петров</b>",
        "phone_e164": "+79123456789",
        "email": "ivan@example.ru",
        "message": "Нужна <script>alert(1)</script>",
        "service_slug": "diagnostics",
        "service_title": "Компьютерная диагностика",
    }
    values.update(overrides)
    return LeadView(**values)


def test_email_message_content(settings: Settings) -> None:
    msg = EmailChannel(settings).build_message(lead_view())
    assert msg["Subject"] == "Новая заявка № 123"
    assert msg["To"] == "owner@example.ru"
    text_part = msg.get_body(("plain",)).get_content()  # type: ignore[union-attr]
    html_part = msg.get_body(("html",)).get_content()  # type: ignore[union-attr]
    assert "+79123456789" in text_part and "Компьютерная диагностика" in text_part
    assert "http://admin.test/leads/0192f5c4-0000-7000-8000-000000000001" in text_part
    assert "<script>" not in html_part and "&lt;script&gt;" in html_part
    assert "Иван &lt;b&gt;Петров&lt;/b&gt;" in html_part
    assert 'href="http://admin.test/leads/0192f5c4' in html_part


def test_email_message_minimal_lead(settings: Settings) -> None:
    msg = EmailChannel(settings).build_message(
        lead_view(email=None, message=None, service_slug=None, service_title=None)
    )
    body = msg.get_body(("plain",)).get_content()  # type: ignore[union-attr]
    assert "Услуга" not in body and "Сообщение" not in body and "Email" not in body


@pytest.mark.parametrize(
    ("port", "use_tls", "start_tls"), [(465, True, None), (587, False, True), (1025, False, None)]
)
async def test_email_tls_mode_by_port(
    monkeypatch: pytest.MonkeyPatch, pg_url: str, port: int, use_tls: bool, start_tls: bool | None
) -> None:
    import aiosmtplib

    seen: dict[str, Any] = {}

    async def fake_send(message: Any, **kwargs: Any) -> None:
        seen.update(kwargs)

    monkeypatch.setattr(aiosmtplib, "send", fake_send)
    s = make_settings(
        pg_url, smtp_host="smtp.example.ru", smtp_port=port, smtp_user="u", smtp_password="pw"
    )
    await EmailChannel(s).send_lead_created(lead_view())
    assert (seen["use_tls"], seen["start_tls"]) == (use_tls, start_tls)
    assert (seen["hostname"], seen["username"], seen["password"]) == ("smtp.example.ru", "u", "pw")


async def test_log_channel_writes_only_number(capsys: pytest.CaptureFixture[str]) -> None:
    from app.logging import configure_logging

    configure_logging("INFO")
    await LogChannel().send_lead_created(lead_view())
    out = capsys.readouterr().out
    assert json.loads(out)["public_number"] == 123
    assert "79123456789" not in out and "Иван" not in out


async def test_max_channel_request() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(
            url=str(request.url),
            auth=request.headers["authorization"],
            body=json.loads(request.content),
        )
        return httpx.Response(200, json={})

    channel = MaxChannel(
        "tok",
        "555",
        "http://admin.test/",
        httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    await channel.send_lead_created(lead_view())
    assert seen["url"] == "https://platform-api2.max.ru/messages?chat_id=555"
    assert seen["auth"] == "tok"
    assert "Новая заявка № 123" in seen["body"]["text"]
    assert "http://admin.test/leads/0192f5c4" in seen["body"]["text"]


async def test_max_channel_raises_on_http_error() -> None:
    transport = httpx.MockTransport(lambda r: httpx.Response(401))
    channel = MaxChannel("tok", "1", "http://a", httpx.AsyncClient(transport=transport))
    with pytest.raises(httpx.HTTPStatusError):
        await channel.send_lead_created(lead_view())


def test_build_channels(pg_url: str) -> None:
    assert set(build_channels(make_settings(pg_url))) == {"log"}
    both = build_channels(make_settings(pg_url, smtp_host="h", max_bot_token="t", max_chat_id="1"))
    assert set(both) == {"email", "max"}


# --- Письмо реально доходит до Mailpit ------------------------------------


@pytest_asyncio.fixture(scope="session")
async def mailpit() -> AsyncIterator[tuple[str, int, int]]:
    container = DockerContainer("axllent/mailpit").with_exposed_ports(1025, 8025)
    with container:
        wait_for_logs(container, "accessible via")
        yield (
            container.get_container_host_ip(),
            int(container.get_exposed_port(1025)),
            int(container.get_exposed_port(8025)),
        )


async def test_email_reaches_mailpit(
    client: AsyncClient,
    mailpit: tuple[str, int, int],
    pg_url: str,
    sm: async_sessionmaker[AsyncSession],
) -> None:
    host, smtp_port, api_port = mailpit
    settings = make_settings(
        pg_url, smtp_host=host, smtp_port=smtp_port, smtp_from="Заявки <noreply@example.ru>"
    )
    await client.post(URL, json=payload(name="Мейл Тестов"))
    # в outbox для канала log; переключим на email, как при настроенном SMTP
    async with sm() as s, s.begin():
        await s.execute(text("UPDATE notification_outbox SET channel = 'email'"))
    async with sm() as s:
        assert await process_batch(s, build_channels(settings), TITLES) == 1

    async with httpx.AsyncClient(base_url=f"http://{host}:{api_port}") as http:
        messages = (await http.get("/api/v1/messages")).json()["messages"]
        assert messages[0]["Subject"] == "Новая заявка № 1"
        assert messages[0]["To"][0]["Address"] == "owner@example.ru"
        full = (await http.get(f"/api/v1/message/{messages[0]['ID']}")).json()
    assert "Мейл Тестов" in full["Text"] and "Мейл Тестов" in full["HTML"]
    assert "Компьютерная диагностика" in full["Text"]
