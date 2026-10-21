from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.booking.service import BookingService
from app.catalog import load_business, load_catalog
from app.db import create_engine, create_sessionmaker
from app.deps import consent_text_sha256, load_service_slugs
from app.errors import install_error_handlers
from app.logging import configure_logging
from app.max.auth import MaxAuthenticator
from app.middleware import AccessLogMiddleware, RequestIdMiddleware
from app.routes import admin_auth, admin_leads, health, max_app, max_webhook, public_leads
from app.services.notifications import load_service_titles
from app.settings import Settings, get_settings

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.sqlalchemy_url)
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)
        app.state.booking_service = BookingService(
            app.state.sessionmaker,
            settings,
            catalog=app.state.catalog,
            consent_text_sha256=consent_text_sha256(),
        )
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(
        title="Заявочка API",
        lifespan=lifespan,
        docs_url=None if settings.is_prod else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_prod else "/openapi.json",
    )
    app.state.settings = settings
    app.state.problem_base = settings.site_origin
    app.state.service_slugs = load_service_slugs(settings.services_file)
    app.state.service_titles = load_service_titles(settings.services_file)
    app.state.catalog = load_catalog(settings.services_file)
    app.state.business = load_business(settings.services_file)
    app.state.max_auth = MaxAuthenticator(settings)
    install_error_handlers(app)
    app.add_middleware(AccessLogMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(public_leads.router, prefix=API_PREFIX)
    app.include_router(admin_auth.router, prefix=API_PREFIX)
    app.include_router(admin_leads.router, prefix=API_PREFIX)
    app.include_router(max_app.router, prefix=API_PREFIX)
    app.include_router(max_webhook.router, prefix=API_PREFIX)
    return app
