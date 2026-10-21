import json
import re
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.domain.errors import (
    CsrfFailed,
    FieldError,
    LeadNotFound,
    RateLimited,
    Unauthenticated,
    ValidationFailed,
    VersionConflict,
)
from app.main import create_app
from tests.conftest import alembic_config, make_settings, run_migration

PROBLEM = "application/problem+json"


class Payload(BaseModel):
    name: str = Field(min_length=2, max_length=5)
    consent: bool


@pytest.fixture
def probe(app: FastAPI) -> FastAPI:
    @app.get("/probe/{kind}")
    async def raise_it(kind: str) -> None:
        errors: dict[str, Exception] = {
            "unauth": Unauthenticated(),
            "csrf": CsrfFailed(),
            "notfound": LeadNotFound(),
            "conflict": VersionConflict(),
            "rate": RateLimited(42),
            "fields": ValidationFailed([FieldError("phone", "phone_invalid")]),
            "boom": RuntimeError("secret internals"),
        }
        raise errors[kind]

    @app.post("/probe-body")
    async def body(payload: Payload) -> dict[str, str]:
        return {"name": payload.name}

    return app


async def test_healthz(client: AsyncClient) -> None:
    r = await client.get("/api/v1/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_readyz_ok(client: AsyncClient) -> None:
    r = await client.get("/api/v1/readyz")
    assert r.status_code == 200


async def test_readyz_503_when_db_down(settings: object) -> None:
    from app.settings import Settings

    assert isinstance(settings, Settings)
    broken = make_settings("postgresql+asyncpg://app:app@127.0.0.1:1/app")
    application = create_app(broken)
    async with application.router.lifespan_context(application):
        transport = ASGITransport(app=application)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.get("/api/v1/readyz")
    assert r.status_code == 503


async def test_request_id_generated_and_echoed(client: AsyncClient) -> None:
    r = await client.get("/api/v1/healthz")
    assert re.fullmatch(r"[0-9a-f-]{36}", r.headers["x-request-id"])
    r = await client.get("/api/v1/healthz", headers={"X-Request-ID": "abc-12345678"})
    assert r.headers["x-request-id"] == "abc-12345678"


async def test_bad_request_id_is_replaced(client: AsyncClient) -> None:
    r = await client.get("/api/v1/healthz", headers={"X-Request-ID": "bad id\twith space"})
    assert r.headers["x-request-id"] != "bad id\twith space"


@pytest.mark.parametrize(
    ("kind", "status", "code"),
    [
        ("unauth", 401, "unauthenticated"),
        ("csrf", 403, "csrf_failed"),
        ("notfound", 404, "not_found"),
        ("conflict", 409, "version_conflict"),
        ("rate", 429, "rate_limited"),
        ("fields", 422, "validation_error"),
        ("boom", 500, "internal_error"),
    ],
)
async def test_problem_json_format(
    client: AsyncClient, probe: FastAPI, kind: str, status: int, code: str
) -> None:
    r = await client.get(f"/probe/{kind}")
    assert r.status_code == status
    assert r.headers["content-type"].startswith(PROBLEM)
    body = r.json()
    assert body["code"] == code
    assert body["status"] == status
    assert body["type"] == f"http://site.test/problems/{code}"
    assert body["request_id"] == r.headers["x-request-id"]
    assert "secret internals" not in r.text
    assert "Traceback" not in r.text


async def test_rate_limited_has_retry_after(client: AsyncClient, probe: FastAPI) -> None:
    r = await client.get("/probe/rate")
    assert r.headers["retry-after"] == "42"


async def test_domain_validation_errors_listed(client: AsyncClient, probe: FastAPI) -> None:
    r = await client.get("/probe/fields")
    assert r.json()["errors"] == [{"field": "phone", "code": "phone_invalid"}]


async def test_pydantic_validation_mapped_to_codes(client: AsyncClient, probe: FastAPI) -> None:
    r = await client.post("/probe-body", json={"name": "a", "consent": "nope"})
    assert r.status_code == 422
    assert {(e["field"], e["code"]) for e in r.json()["errors"]} == {
        ("name", "too_short"),
        ("consent", "invalid_format"),
    }
    r = await client.post("/probe-body", json={"name": "abcdefgh", "consent": True})
    assert r.json()["errors"] == [{"field": "name", "code": "too_long"}]
    r = await client.post("/probe-body", json={})
    assert {e["code"] for e in r.json()["errors"]} == {"required"}


async def test_malformed_json_is_bad_request(client: AsyncClient, probe: FastAPI) -> None:
    r = await client.post(
        "/probe-body", content="{not json", headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 400
    assert r.json()["code"] == "bad_request"


async def test_unknown_route_is_problem_404(client: AsyncClient) -> None:
    r = await client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["code"] == "not_found"
    assert r.headers["content-type"].startswith(PROBLEM)


async def test_method_not_allowed_is_problem(client: AsyncClient) -> None:
    r = await client.post("/api/v1/healthz")
    assert r.status_code == 405
    assert r.headers["content-type"].startswith(PROBLEM)


async def test_openapi_hidden_in_prod() -> None:
    prod = make_settings(
        "postgresql+asyncpg://app:app@127.0.0.1:1/app",
        app_env="prod",
        smtp_host="h",
        smtp_user="u",
        smtp_password="p",
        smtp_from="f",
    )
    application = create_app(prod)
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        assert (await c.get("/openapi.json")).status_code == 404
        assert (await c.get("/docs")).status_code == 404


async def test_openapi_available_in_dev(client: AsyncClient) -> None:
    assert (await client.get("/openapi.json")).status_code == 200


async def test_access_log_has_no_pii_and_skips_health(
    client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.logging import configure_logging

    configure_logging("INFO")
    await client.get("/api/v1/healthz")
    await client.get("/api/v1/missing?phone=%2B79991234567")
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line]
    assert [e["path"] for e in lines] == ["/api/v1/missing"]
    event = lines[0]
    assert event["status"] == 404
    assert set(event) >= {"ts", "level", "event", "request_id", "path", "status", "duration_ms"}
    assert "79991234567" not in json.dumps(event)


async def test_unhandled_error_logged_with_traceback(
    client: AsyncClient, probe: FastAPI, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.logging import configure_logging

    configure_logging("INFO")
    await client.get("/probe/boom")
    out = capsys.readouterr().out
    assert "unhandled_error" in out
    assert "RuntimeError" in out


# --- Миграции -------------------------------------------------------------


@pytest.fixture
async def empty_engine(pg_url: str) -> AsyncIterator[AsyncEngine]:
    admin = create_async_engine(pg_url, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text("DROP DATABASE IF EXISTS migtest"))
        await conn.execute(text("CREATE DATABASE migtest"))
    await admin.dispose()
    url = pg_url.rsplit("/", 1)[0] + "/migtest"
    eng = create_async_engine(url)
    yield eng
    await eng.dispose()


async def _tables(eng: AsyncEngine) -> set[str]:
    async with eng.connect() as conn:
        rows = await conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        )
        return {r[0] for r in rows} - {"alembic_version"}


async def test_migrations_up_down_up(empty_engine: AsyncEngine) -> None:
    expected = {
        "admin_users",
        "admin_sessions",
        "consents",
        "leads",
        "lead_events",
        "notification_outbox",
        "rate_limits",
        "resources",
        "resource_services",
        "working_hours",
        "schedule_exceptions",
        "booking_settings",
        "bookings",
        "booking_events",
        "max_updates",
    }
    for fn, rev in (("upgrade", "head"), ("downgrade", "base"), ("upgrade", "head")):
        async with empty_engine.begin() as conn:
            await conn.run_sync(run_migration, fn, rev)
        assert await _tables(empty_engine) == (set() if rev == "base" else expected)


async def test_models_match_migrations(empty_engine: AsyncEngine) -> None:
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from app.models import Base

    async with empty_engine.begin() as conn:
        await conn.run_sync(run_migration, "upgrade", "head")

        def diff(sync_conn: object) -> list[object]:
            ctx = MigrationContext.configure(sync_conn)  # type: ignore[arg-type]
            return compare_metadata(ctx, Base.metadata)

        assert await conn.run_sync(diff) == []
    assert alembic_config() is not None


async def test_uuidv7_and_defaults(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO consents (policy_version, consent_text_sha256, ip_hash, user_agent)"
                " VALUES ('v', '\\x00', '\\x00', 'ua')"
            )
        )
        row = (await conn.execute(text("SELECT id, given_at FROM consents"))).one()
    assert row.id.version == 7
    assert row.given_at is not None


async def test_lead_constraints_enforced(engine: AsyncEngine) -> None:
    from sqlalchemy.exc import IntegrityError

    async with engine.begin() as conn:
        consent_id = (
            await conn.execute(
                text(
                    "INSERT INTO consents (policy_version, consent_text_sha256, ip_hash,"
                    " user_agent) VALUES ('v', '\\x00', '\\x00', 'ua') RETURNING id"
                )
            )
        ).scalar_one()

    async def insert(name: str, phone: str) -> None:
        async with engine.begin() as conn:
            await conn.execute(
                text("INSERT INTO leads (name, phone_e164, consent_id) VALUES (:n, :p, :c)"),
                {"n": name, "p": phone, "c": consent_id},
            )

    await insert("Иван", "+79991234567")
    with pytest.raises(IntegrityError, match="ck_leads_name_len"):
        await insert("И", "+79991234567")
    with pytest.raises(IntegrityError, match="ck_leads_phone_format"):
        await insert("Иван", "89991234567")
    async with engine.connect() as conn:
        row = (await conn.execute(text("SELECT public_number, status, version FROM leads"))).one()
    assert (row.public_number, row.status, row.version) == (1, "new", 1)
