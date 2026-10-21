from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import CsrfAdmin, CurrentAdmin, get_auth_service, get_settings_dep
from app.db import get_session
from app.schemas.auth import AdminMe, LoginRequest, PasswordChange
from app.schemas.problem import problem_responses
from app.security.ip import client_ip
from app.security.sessions import NewSession
from app.services.auth import AuthService
from app.settings import Settings

router = APIRouter(
    prefix="/admin/auth",
    tags=["admin-auth"],
    responses=problem_responses(400, 401, 403, 422, 429),
)

Service = Annotated[AuthService, Depends(get_auth_service)]
Session = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


def set_auth_cookies(response: Response, settings: Settings, new: NewSession) -> None:
    common = {
        "max_age": new.max_age,
        "path": "/",
        "secure": settings.secure_cookies,
        "samesite": "strict",
    }
    response.set_cookie(settings.session_cookie_name, new.token, httponly=True, **common)  # type: ignore[arg-type]
    # CSRF-cookie читает фронтенд и шлёт в заголовке, поэтому без HttpOnly.
    response.set_cookie(settings.csrf_cookie_name, new.csrf_token, httponly=False, **common)  # type: ignore[arg-type]


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    for name in (settings.session_cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(
            name,
            path="/",
            secure=settings.secure_cookies,
            samesite="strict",
            httponly=name == settings.session_cookie_name,
        )


@router.post("/login", status_code=204)
async def login(
    body: LoginRequest, request: Request, service: Service, settings: SettingsDep
) -> Response:
    new = await service.login(
        str(body.email),
        body.password,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )
    response = Response(status_code=204)
    set_auth_cookies(response, settings, new)
    return response


@router.post("/logout", status_code=204)
async def logout(
    identity: CsrfAdmin, session: Session, service: Service, settings: SettingsDep
) -> Response:
    await service.logout(session, identity)
    response = Response(status_code=204)
    clear_auth_cookies(response, settings)
    return response


@router.get("/me")
async def me(identity: CurrentAdmin) -> AdminMe:
    return AdminMe(id=identity.user_id, email=identity.email)


@router.post("/password", status_code=204)
async def change_password(
    body: PasswordChange, identity: CsrfAdmin, session: Session, service: Service
) -> Response:
    await service.change_password(
        session,
        identity,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return Response(status_code=204)


@router.post("/sessions/revoke-all", status_code=204)
async def revoke_all(
    identity: CsrfAdmin, session: Session, service: Service, settings: SettingsDep
) -> Response:
    await service.revoke_all(session, identity)
    response = Response(status_code=204)
    clear_auth_cookies(response, settings)
    return response
