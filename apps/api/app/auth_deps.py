from typing import Annotated, cast

from fastapi import Depends, Request

from app.domain.errors import Unauthenticated
from app.security.csrf import verify_csrf
from app.security.sessions import AdminIdentity, find_identity
from app.services.auth import AuthService
from app.settings import Settings

CSRF_HEADER = "X-CSRF-Token"


def get_settings_dep(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


async def current_admin(
    request: Request, settings: Annotated[Settings, Depends(get_settings_dep)]
) -> AdminIdentity:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise Unauthenticated
    # Отдельная короткая транзакция: продление last_seen_at не зависит от сессии запроса.
    async with request.app.state.sessionmaker() as session, session.begin():
        identity = await find_identity(session, token)
    if identity is None:
        raise Unauthenticated
    return identity


async def admin_with_csrf(
    request: Request,
    identity: Annotated[AdminIdentity, Depends(current_admin)],
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> AdminIdentity:
    """Для изменяющих запросов: сначала вход (401), затем CSRF (403)."""
    verify_csrf(
        identity,
        request.headers.get(CSRF_HEADER),
        request.cookies.get(settings.csrf_cookie_name),
    )
    return identity


def get_auth_service(
    request: Request, settings: Annotated[Settings, Depends(get_settings_dep)]
) -> AuthService:
    return AuthService(request.app.state.sessionmaker, settings)


CurrentAdmin = Annotated[AdminIdentity, Depends(current_admin)]
CsrfAdmin = Annotated[AdminIdentity, Depends(admin_with_csrf)]
