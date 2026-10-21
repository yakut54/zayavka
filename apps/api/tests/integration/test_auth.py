import hashlib
import io
import json
import uuid
from collections.abc import Callable
from datetime import timedelta

import pytest
from argon2 import PasswordHasher
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app import cli
from app.main import create_app
from app.security import passwords
from app.services.auth import create_admin
from tests.conftest import make_settings

EMAIL = "owner@example.ru"
PASSWORD = "correct-horse-battery"
BASE = "/api/v1/admin/auth"


async def make_admin(
    engine: AsyncEngine, email: str = EMAIL, password: str = PASSWORD
) -> uuid.UUID:
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        return await create_admin(s, email, password)


async def login(
    client: AsyncClient, email: str = EMAIL, password: str = PASSWORD
) -> tuple[int, str, str]:
    r = await client.post(f"{BASE}/login", json={"email": email, "password": password})
    return r.status_code, client.cookies.get("csrf") or "", client.cookies.get("session") or ""


def csrf(client: AsyncClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("csrf") or ""}


@pytest.fixture
async def admin_id(engine: AsyncEngine) -> uuid.UUID:
    return await make_admin(engine)


async def test_login_sets_cookies_and_session(
    client: AsyncClient, admin_id: uuid.UUID, session: AsyncSession
) -> None:
    r = await client.post(
        f"{BASE}/login",
        json={"email": EMAIL, "password": PASSWORD},
        headers={"User-Agent": "pytest-browser"},
    )
    assert r.status_code == 204 and r.content == b""
    cookies = {h.split("=", 1)[0]: h for h in r.headers.get_list("set-cookie")}
    session_cookie, csrf_cookie = cookies["session"].lower(), cookies["csrf"].lower()
    for c in (session_cookie, csrf_cookie):
        assert "samesite=strict" in c and "path=/" in c and "max-age=604800" in c
    assert "httponly" in session_cookie
    assert "httponly" not in csrf_cookie

    token, csrf_token = client.cookies["session"], client.cookies["csrf"]
    row = (await session.execute(text("SELECT * FROM admin_sessions"))).one()
    assert bytes(row.token_hash) == hashlib.sha256(token.encode()).digest()
    assert bytes(row.csrf_token_hash) == hashlib.sha256(csrf_token.encode()).digest()
    assert token.encode() not in bytes(row.token_hash)
    assert len(bytes(row.ip_hash)) == 32 and row.user_agent == "pytest-browser"
    assert row.user_id == admin_id and row.revoked_at is None
    last_login = (await session.execute(text("SELECT last_login_at FROM admin_users"))).scalar_one()
    assert last_login is not None


async def test_me(client: AsyncClient, admin_id: uuid.UUID) -> None:
    assert (await client.get(f"{BASE}/me")).status_code == 401
    await login(client)
    r = await client.get(f"{BASE}/me")
    assert r.status_code == 200
    assert r.json() == {"id": str(admin_id), "email": EMAIL}


async def test_wrong_password_and_unknown_email_look_identical(
    client: AsyncClient, admin_id: uuid.UUID, monkeypatch: pytest.MonkeyPatch
) -> None:
    dummy_calls: list[str] = []
    real = passwords.verify_dummy
    monkeypatch.setattr(
        "app.services.auth.passwords.verify_dummy", lambda p: (dummy_calls.append(p), real(p))
    )
    a = await client.post(f"{BASE}/login", json={"email": EMAIL, "password": "wrong-password-1"})
    b = await client.post(f"{BASE}/login", json={"email": "nobody@example.ru", "password": "x"})
    assert a.status_code == b.status_code == 401
    ja, jb = a.json(), b.json()
    for j in (ja, jb):
        j.pop("request_id")
    assert ja == jb and ja["code"] == "unauthenticated"
    assert dummy_calls == ["x"]
    assert not client.cookies


async def test_email_is_case_insensitive(client: AsyncClient, admin_id: uuid.UUID) -> None:
    status, _, _ = await login(client, email="OWNER@Example.RU")
    assert status == 204


async def test_inactive_admin_cannot_login(
    client: AsyncClient, admin_id: uuid.UUID, session: AsyncSession
) -> None:
    await session.execute(text("UPDATE admin_users SET is_active = false"))
    await session.commit()
    assert (await login(client))[0] == 401


async def test_eleventh_login_attempt_is_rate_limited(
    client: AsyncClient, admin_id: uuid.UUID
) -> None:
    for _ in range(10):
        r = await client.post(f"{BASE}/login", json={"email": EMAIL, "password": "bad-password-x"})
        assert r.status_code == 401
    r = await client.post(f"{BASE}/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) >= 1
    other = await client.post(f"{BASE}/login", json={"email": "b@example.ru", "password": "x"})
    assert other.status_code == 401  # другой email — другое ведро


async def test_login_validation(client: AsyncClient) -> None:
    r = await client.post(f"{BASE}/login", json={"email": "ab", "password": "x"})
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "email", "code": "too_short"}]
    # не-email — просто неверные учётные данные, без подсказок
    r = await client.post(f"{BASE}/login", json={"email": "nope", "password": "x"})
    assert r.status_code == 401


async def test_state_changing_requests_require_csrf(
    client: AsyncClient, admin_id: uuid.UUID
) -> None:
    await login(client)
    path = f"{BASE}/logout"
    r = await client.post(path)
    assert r.status_code == 403 and r.json()["code"] == "csrf_failed"
    r = await client.post(path, headers={"X-CSRF-Token": "wrong"})
    assert r.status_code == 403
    # заголовок валиден по хешу сессии, но cookie подменён
    real = client.cookies["csrf"]
    client.cookies.set("csrf", "other-value", domain="test.local", path="/")
    assert (await client.post(path, headers={"X-CSRF-Token": real})).status_code == 403
    assert (await client.post(path, headers={"X-CSRF-Token": "other-value"})).status_code == 403
    client.cookies.set("csrf", real, domain="test.local", path="/")
    assert (await client.post(path, headers=csrf(client))).status_code == 204


async def test_csrf_checked_after_authentication(client: AsyncClient) -> None:
    r = await client.post(f"{BASE}/logout", headers={"X-CSRF-Token": "x"})
    assert r.status_code == 401


async def test_expired_session_is_401(
    client: AsyncClient, admin_id: uuid.UUID, session: AsyncSession
) -> None:
    await login(client)
    await session.execute(text("UPDATE admin_sessions SET expires_at = now() - interval '1 s'"))
    await session.commit()
    assert (await client.get(f"{BASE}/me")).status_code == 401


async def test_revoked_session_is_401(
    client: AsyncClient, admin_id: uuid.UUID, session: AsyncSession
) -> None:
    await login(client)
    await session.execute(text("UPDATE admin_sessions SET revoked_at = now()"))
    await session.commit()
    assert (await client.get(f"{BASE}/me")).status_code == 401


async def test_garbage_session_cookie_is_401(client: AsyncClient) -> None:
    client.cookies.set("session", "x" * 43, domain="test.local", path="/")
    assert (await client.get(f"{BASE}/me")).status_code == 401


async def test_last_seen_extended_at_most_every_five_minutes(
    client: AsyncClient, admin_id: uuid.UUID, session: AsyncSession
) -> None:
    await login(client)
    await client.get(f"{BASE}/me")
    first = (await session.execute(text("SELECT last_seen_at FROM admin_sessions"))).scalar_one()
    await session.rollback()
    await client.get(f"{BASE}/me")
    again = (await session.execute(text("SELECT last_seen_at FROM admin_sessions"))).scalar_one()
    assert again == first

    await session.execute(
        text("UPDATE admin_sessions SET last_seen_at = now() - interval '6 minutes'")
    )
    await session.commit()
    await client.get(f"{BASE}/me")
    refreshed = (
        await session.execute(text("SELECT last_seen_at FROM admin_sessions"))
    ).scalar_one()
    assert refreshed - first < timedelta(minutes=1)
    assert refreshed > first - timedelta(seconds=1)


async def test_logout_revokes_and_clears_cookies(
    client: AsyncClient, admin_id: uuid.UUID, session: AsyncSession
) -> None:
    await login(client)
    r = await client.post(f"{BASE}/logout", headers=csrf(client))
    assert r.status_code == 204
    cleared = [h.lower() for h in r.headers.get_list("set-cookie")]
    assert len(cleared) == 2 and all("max-age=0" in h for h in cleared)
    assert (await session.execute(text("SELECT revoked_at FROM admin_sessions"))).scalar_one()
    assert (await client.get(f"{BASE}/me")).status_code == 401


async def test_change_password_revokes_other_sessions_keeps_current(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    admin_id: uuid.UUID,
    session: AsyncSession,
) -> None:
    other = client_factory("10.5.5.5")
    await login(client)
    await login(other)
    new_password = "brand-new-password-1"
    r = await client.post(
        f"{BASE}/password",
        json={"current_password": PASSWORD, "new_password": new_password},
        headers=csrf(client),
    )
    assert r.status_code == 204
    assert (await client.get(f"{BASE}/me")).status_code == 200
    assert (await other.get(f"{BASE}/me")).status_code == 401
    revoked = (
        await session.execute(
            text("SELECT count(*) FROM admin_sessions WHERE revoked_at IS NOT NULL")
        )
    ).scalar_one()
    assert revoked == 1

    fresh = client_factory("10.6.6.6")
    assert (await login(fresh, password=PASSWORD))[0] == 401
    assert (await login(fresh, password=new_password))[0] == 204


async def test_change_password_validation(client: AsyncClient, admin_id: uuid.UUID) -> None:
    await login(client)
    r = await client.post(
        f"{BASE}/password",
        json={"current_password": "not-my-password", "new_password": "long-enough-password"},
        headers=csrf(client),
    )
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "current_password", "code": "wrong_password"}]
    r = await client.post(
        f"{BASE}/password",
        json={"current_password": PASSWORD, "new_password": "short"},
        headers=csrf(client),
    )
    assert r.status_code == 422
    assert r.json()["errors"] == [{"field": "new_password", "code": "too_short"}]


async def test_revoke_all_sessions_including_current(
    client: AsyncClient,
    client_factory: Callable[[str], AsyncClient],
    admin_id: uuid.UUID,
) -> None:
    other = client_factory("10.7.7.7")
    await login(client)
    await login(other)
    r = await client.post(f"{BASE}/sessions/revoke-all", headers=csrf(client))
    assert r.status_code == 204
    assert (await client.get(f"{BASE}/me")).status_code == 401
    assert (await other.get(f"{BASE}/me")).status_code == 401


async def test_old_hash_params_are_upgraded_on_login(
    client: AsyncClient, admin_id: uuid.UUID, session: AsyncSession
) -> None:
    weak = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(PASSWORD)
    await session.execute(text("UPDATE admin_users SET password_hash = :h"), {"h": weak})
    await session.commit()
    assert (await login(client))[0] == 204
    new_hash = (await session.execute(text("SELECT password_hash FROM admin_users"))).scalar_one()
    assert new_hash != weak and new_hash.startswith("$argon2id$")
    assert passwords.verify_password(new_hash, PASSWORD)


async def test_secrets_not_logged(
    client: AsyncClient, admin_id: uuid.UUID, capsys: pytest.CaptureFixture[str]
) -> None:
    from app.logging import configure_logging

    configure_logging("DEBUG")
    await login(client)
    await client.post(f"{BASE}/login", json={"email": EMAIL, "password": "super-secret-wrong"})
    out = capsys.readouterr().out
    for secret in (PASSWORD, "super-secret-wrong", EMAIL, client.cookies["session"]):
        assert secret not in out
    for line in out.splitlines():
        json.loads(line)


async def test_prod_cookies_use_host_prefix_and_secure(
    engine: AsyncEngine, pg_url: str, admin_id: uuid.UUID
) -> None:
    prod = make_settings(
        pg_url,
        app_env="prod",
        smtp_host="h",
        smtp_user="u",
        smtp_password="p",
        smtp_from="f",
    )
    application: FastAPI = create_app(prod)
    async with application.router.lifespan_context(application):
        transport = ASGITransport(app=application, client=("10.8.8.8", 1))
        async with AsyncClient(transport=transport, base_url="https://site.test") as c:
            r = await c.post(f"{BASE}/login", json={"email": EMAIL, "password": PASSWORD})
            assert r.status_code == 204
            headers = [h.lower() for h in r.headers.get_list("set-cookie")]
            assert any(
                h.startswith("__host-session=") and "secure" in h and "httponly" in h
                for h in headers
            )
            assert any(h.startswith("__host-csrf=") and "secure" in h for h in headers)
            assert (await c.get(f"{BASE}/me")).status_code == 200


# --- CLI ------------------------------------------------------------------


def run_cli(monkeypatch: pytest.MonkeyPatch, pg_url: str, argv: list[str], stdin: str) -> int:
    monkeypatch.setattr(cli, "get_settings", lambda: make_settings(pg_url))
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    return cli.main(argv)


async def test_cli_create_admin_and_login(
    client: AsyncClient, pg_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    import asyncio

    code = await asyncio.to_thread(
        run_cli, monkeypatch, pg_url, ["create-admin", "--email", EMAIL, "--stdin"], PASSWORD + "\n"
    )
    assert code == 0
    assert (await login(client))[0] == 204


async def test_cli_create_admin_rejects_duplicate_and_short_password(
    admin_id: uuid.UUID,
    pg_url: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import asyncio

    dup = await asyncio.to_thread(
        run_cli, monkeypatch, pg_url, ["create-admin", "--email", EMAIL, "--stdin"], PASSWORD
    )
    assert dup == 1 and "уже существует" in capsys.readouterr().err
    short = await asyncio.to_thread(
        run_cli,
        monkeypatch,
        pg_url,
        ["create-admin", "--email", "b@example.ru", "--stdin"],
        "short",
    )
    assert short == 1


async def test_cli_reset_password_revokes_sessions(
    client: AsyncClient,
    admin_id: uuid.UUID,
    pg_url: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import asyncio

    await login(client)
    new = "reset-password-12345"
    code = await asyncio.to_thread(
        run_cli, monkeypatch, pg_url, ["reset-password", "--email", EMAIL, "--stdin"], new
    )
    assert code == 0
    assert (await client.get(f"{BASE}/me")).status_code == 401
    assert (await login(client, password=PASSWORD))[0] == 401
    assert (await login(client, password=new))[0] == 204
    missing = await asyncio.to_thread(
        run_cli, monkeypatch, pg_url, ["reset-password", "--email", "x@y.ru", "--stdin"], new
    )
    assert missing == 1


def test_cli_interactive_password_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter(["aaaaaaaaaaaa1", "bbbbbbbbbbbb2"])
    monkeypatch.setattr("getpass.getpass", lambda prompt: next(answers))
    with pytest.raises(SystemExit, match="не совпадают"):
        cli.main(["create-admin", "--email", EMAIL])


def test_cli_interactive_password_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("getpass.getpass", lambda prompt: "same-password-12")
    assert cli._read_password() == "same-password-12"
