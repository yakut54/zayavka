import os
from collections.abc import AsyncIterator, Callable, Iterator

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.community.postgres import PostgresContainer

from app.main import create_app
from app.settings import Settings

PG_IMAGE = "postgres:18"
TABLES = (
    "rate_limits, notification_outbox, lead_events, leads, consents, admin_sessions, admin_users"
)


def make_settings(database_url: str, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "test",
        "database_url": database_url,
        "secret_key": "test-secret-key-test-secret-key-test-secret-key-64bytes!!",
        "site_origin": "http://site.test",
        "admin_origin": "http://admin.test",
        "notify_emails": "owner@example.ru",
        "privacy_policy_version": "2026-10-20",
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


def alembic_config() -> Config:
    return Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))


def run_migration(conn: object, fn: str, revision: str) -> None:
    cfg = alembic_config()
    cfg.attributes["connection"] = conn
    getattr(command, fn)(cfg, revision)


@pytest.fixture(scope="session")
def pg() -> Iterator[PostgresContainer]:
    with PostgresContainer(PG_IMAGE, driver="asyncpg") as container:
        yield container


@pytest.fixture(scope="session")
def pg_url(pg: PostgresContainer) -> str:
    return pg.get_connection_url()


@pytest_asyncio.fixture(scope="session")
async def engine(pg_url: str) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(pg_url)
    async with eng.begin() as conn:
        await conn.run_sync(run_migration, "upgrade", "head")
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_db(request: pytest.FixtureRequest) -> AsyncIterator[None]:
    yield
    if "engine" in request.fixturenames:
        eng: AsyncEngine = request.getfixturevalue("engine")
        async with eng.begin() as conn:
            await conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))


@pytest.fixture
def settings(pg_url: str) -> Settings:
    return make_settings(pg_url)


@pytest_asyncio.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        yield s


@pytest_asyncio.fixture
async def app(engine: AsyncEngine, settings: Settings) -> AsyncIterator[FastAPI]:
    application = create_app(settings)
    async with application.router.lifespan_context(application):
        yield application


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def client_factory(app: FastAPI) -> AsyncIterator[Callable[[str], AsyncClient]]:
    """Клиенты с заданным IP отправителя (разные посетители для rate limit)."""
    clients: list[AsyncClient] = []

    def make(ip: str) -> AsyncClient:
        transport = ASGITransport(app=app, raise_app_exceptions=False, client=(ip, 5000))
        c = AsyncClient(transport=transport, base_url="http://test")
        clients.append(c)
        return c

    yield make
    for c in clients:
        await c.aclose()
