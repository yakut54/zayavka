import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import consent_text_sha256

URL = "/api/v1/public/leads"
POLICY = "2026-10-20"


def payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "Иван Петров",
        "phone": "+7 (912) 345-67-89",
        "email": "ivan@example.ru",
        "message": "Нужна диагностика",
        "service_slug": "diagnostics",
        "consent": True,
        "policy_version": POLICY,
        "utm": {"utm_source": "yandex"},
        "website": "",
        "elapsed_ms": 8000,
    }
    body.update(overrides)
    return body


async def count(session: AsyncSession, table: str) -> int:
    return int((await session.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one())  # noqa: S608


async def test_create_lead_writes_everything(client: AsyncClient, session: AsyncSession) -> None:
    r = await client.post(URL, json=payload(), headers={"User-Agent": "pytest-ua"})
    assert r.status_code == 201
    assert r.json() == {"public_number": 1}

    lead = (await session.execute(text("SELECT * FROM leads"))).one()
    assert lead.phone_e164 == "+79123456789"
    assert lead.status == "new" and lead.version == 1 and lead.source == "site"
    assert lead.utm == {"utm_source": "yandex"}
    assert lead.email == "ivan@example.ru"

    consent = (await session.execute(text("SELECT * FROM consents"))).one()
    assert consent.id == lead.consent_id
    assert consent.policy_version == POLICY
    assert bytes(consent.consent_text_sha256) == consent_text_sha256()
    assert len(bytes(consent.ip_hash)) == 32 and consent.user_agent == "pytest-ua"

    event = (await session.execute(text("SELECT * FROM lead_events"))).one()
    assert event.lead_id == lead.id and event.type == "created" and event.actor_user_id is None

    outbox = (await session.execute(text("SELECT * FROM notification_outbox"))).all()
    assert [(o.channel, o.status, o.kind) for o in outbox] == [("log", "pending", "lead_created")]
    assert outbox[0].payload == {"lead_id": str(lead.id)}


async def test_public_numbers_increment(client: AsyncClient) -> None:
    assert (await client.post(URL, json=payload())).json()["public_number"] == 1
    assert (await client.post(URL, json=payload())).json()["public_number"] == 2


async def test_optional_fields_can_be_omitted(client: AsyncClient, session: AsyncSession) -> None:
    body = payload()
    for key in ("email", "message", "service_slug", "utm"):
        body.pop(key)
    assert (await client.post(URL, json=body)).status_code == 201
    row = (await session.execute(text("SELECT email, message, service_slug, utm FROM leads"))).one()
    assert (row.email, row.message, row.service_slug, row.utm) == (None, None, None, {})


async def test_blank_message_stored_as_null(client: AsyncClient, session: AsyncSession) -> None:
    await client.post(URL, json=payload(message="   "))
    assert (await session.execute(text("SELECT message FROM leads"))).scalar_one() is None


async def test_consent_missing_or_false_is_422(client: AsyncClient, session: AsyncSession) -> None:
    r = await client.post(URL, json=payload(consent=False))
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "consent", "code": "consent_required"}]
    body = {k: v for k, v in payload().items() if k != "consent"}
    r = await client.post(URL, json=body)
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "consent", "code": "required"}]
    assert await count(session, "leads") == 0


async def test_old_policy_version_is_422(client: AsyncClient, session: AsyncSession) -> None:
    r = await client.post(URL, json=payload(policy_version="2020-01-01"))
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "consent", "code": "consent_required"}]
    assert await count(session, "consents") == 0


@pytest.mark.parametrize("phone", ["", "123", "abc", "+7 000 000 00 00"])
async def test_invalid_phone_is_422(client: AsyncClient, phone: str) -> None:
    r = await client.post(URL, json=payload(phone=phone))
    assert r.status_code == 422
    assert {"field": "phone", "code": "phone_invalid"} in r.json()["errors"]


async def test_unknown_service_is_422(client: AsyncClient) -> None:
    r = await client.post(URL, json=payload(service_slug="nope"))
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "service_slug", "code": "unknown_service"}]


async def test_phone_and_service_errors_reported_together(client: AsyncClient) -> None:
    r = await client.post(URL, json=payload(phone="1", service_slug="nope"))
    assert {e["code"] for e in r.json()["errors"]} == {"phone_invalid", "unknown_service"}


@pytest.mark.parametrize(
    ("change", "field", "code"),
    [
        ({"name": "И"}, "name", "too_short"),
        ({"name": "И" * 101}, "name", "too_long"),
        ({"message": "x" * 2001}, "message", "too_long"),
        ({"email": "not-an-email"}, "email", "email_invalid"),
        ({"utm": {"evil": "1"}}, "utm", "invalid_format"),
        ({"elapsed_ms": -1}, "elapsed_ms", "invalid_format"),
        ({"unexpected": 1}, "unexpected", "invalid_format"),
    ],
)
async def test_field_validation(
    client: AsyncClient, change: dict[str, Any], field: str, code: str
) -> None:
    r = await client.post(URL, json=payload(**change))
    assert r.status_code == 422
    assert {"field": field, "code": code} in r.json()["errors"]


async def test_name_is_stripped(client: AsyncClient, session: AsyncSession) -> None:
    await client.post(URL, json=payload(name="  Анна  "))
    assert (await session.execute(text("SELECT name FROM leads"))).scalar_one() == "Анна"


@pytest.mark.parametrize("change", [{"website": "http://spam"}, {"elapsed_ms": 2999}])
async def test_honeypot_and_fast_fill_silently_dropped(
    client: AsyncClient, session: AsyncSession, change: dict[str, Any]
) -> None:
    r = await client.post(URL, json=payload(**change))
    assert r.status_code == 201
    assert isinstance(r.json()["public_number"], int)
    for table in ("leads", "consents", "lead_events", "notification_outbox"):
        assert await count(session, table) == 0


async def test_fill_time_boundary_is_accepted(client: AsyncClient, session: AsyncSession) -> None:
    await client.post(URL, json=payload(elapsed_ms=3000))
    assert await count(session, "leads") == 1


async def test_sixth_lead_from_same_ip_is_rate_limited(
    client_factory: Callable[[str], AsyncClient], session: AsyncSession
) -> None:
    client = client_factory("10.1.1.1")
    for _ in range(5):
        assert (await client.post(URL, json=payload())).status_code == 201
    r = await client.post(URL, json=payload())
    assert r.status_code == 429
    assert r.json()["code"] == "rate_limited"
    assert 1 <= int(r.headers["retry-after"]) <= 600
    assert await count(session, "leads") == 5

    other = client_factory("10.2.2.2")
    assert (await other.post(URL, json=payload())).status_code == 201


async def test_rate_limit_counts_invalid_requests_and_survives_rollback(
    client_factory: Callable[[str], AsyncClient], session: AsyncSession
) -> None:
    client = client_factory("10.3.3.3")
    for _ in range(5):
        assert (await client.post(URL, json=payload(phone="1"))).status_code == 422
    assert (await client.post(URL, json=payload())).status_code == 429
    hits = (await session.execute(text("SELECT hits FROM rate_limits"))).scalar_one()
    assert hits == 6


async def test_rate_limit_bucket_holds_hash_not_ip(
    client_factory: Callable[[str], AsyncClient], session: AsyncSession
) -> None:
    await client_factory("203.0.113.77").post(URL, json=payload())
    bucket = (await session.execute(text("SELECT bucket FROM rate_limits"))).scalar_one()
    assert bucket.startswith("leads:")
    assert "203.0.113.77" not in bucket


async def test_logs_contain_no_personal_data(
    client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.logging import configure_logging

    configure_logging("DEBUG")
    await client.post(URL, json=payload(name="Секретнов", message="приватный текст"))
    await client.post(URL, json=payload(name="Спамеров", website="x"))
    await client.post(URL, json=payload(name="Ошибкин", phone="1"))
    out = capsys.readouterr().out
    assert "spam_suspected" in out
    secrets = ("Секретнов", "Спамеров", "Ошибкин", "приватный", "79123456789", "ivan@", "127.0.0.1")
    for secret in secrets:
        assert secret not in out
    for line in out.splitlines():
        json.loads(line)


class StubCaptcha:
    def __init__(self, *, ok: bool) -> None:
        self.ok = ok
        self.calls: list[tuple[str, str]] = []

    async def verify(self, token: str, ip: str) -> bool:
        self.calls.append((token, ip))
        return self.ok


async def test_captcha_enforced_when_enabled(
    client: AsyncClient, app: FastAPI, monkeypatch: pytest.MonkeyPatch, session: AsyncSession
) -> None:
    import app.deps as deps

    stub = StubCaptcha(ok=False)
    monkeypatch.setattr(deps, "SmartCaptchaVerifier", lambda key: stub)
    monkeypatch.setattr(app.state.settings, "smartcaptcha_server_key", SecretStr("server-key"))

    r = await client.post(URL, json=payload())
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "captcha_token", "code": "invalid_format"}]
    r = await client.post(URL, json=payload(captcha_token="bad"))
    assert r.status_code == 422
    assert stub.calls == [("bad", "127.0.0.1")]
    assert await count(session, "leads") == 0

    stub.ok = True
    r = await client.post(URL, json=payload(captcha_token="good"))
    assert r.status_code == 201
