import uuid

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.errors import DomainError, FieldError, Unauthenticated, ValidationFailed
from app.models import AdminUser
from app.security import passwords, sessions
from app.security.ip import hash_ip
from app.services import ratelimit
from app.settings import Settings


class AdminAlreadyExists(DomainError):
    status = 409
    code = "admin_exists"
    detail = "Администратор с таким email уже существует"


class AdminNotFound(DomainError):
    status = 404
    code = "not_found"
    detail = "Администратор не найден"


def validate_new_password(password: str, field: str = "new_password") -> None:
    if len(password) < passwords.MIN_PASSWORD_LENGTH:
        raise ValidationFailed([FieldError(field, "too_short")])


class AuthService:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], settings: Settings) -> None:
        self._sessionmaker = sessionmaker
        self._settings = settings

    async def login(
        self, email: str, password: str, *, ip: str, user_agent: str
    ) -> sessions.NewSession:
        ip_hash = hash_ip(ip, self._settings.secret_key.get_secret_value())
        await ratelimit.enforce(
            self._sessionmaker,
            f"login:{ip_hash.hex()}:{email.strip().lower()}",
            self._settings.rate_limit_login,
        )
        async with self._sessionmaker() as session, session.begin():
            user = (
                await session.execute(
                    select(AdminUser).where(
                        AdminUser.email == email.strip(), AdminUser.is_active.is_(True)
                    )
                )
            ).scalar_one_or_none()
            if user is None:
                passwords.verify_dummy(password)
                raise Unauthenticated("Неверный email или пароль")
            if not passwords.verify_password(user.password_hash, password):
                raise Unauthenticated("Неверный email или пароль")
            if passwords.needs_rehash(user.password_hash):
                user.password_hash = passwords.hash_password(password)
            user.last_login_at = func.now()
            return await sessions.create_session(
                session,
                user_id=user.id,
                ip_hash=ip_hash,
                user_agent=user_agent,
                ttl_hours=self._settings.session_ttl_hours,
            )

    async def logout(self, session: AsyncSession, identity: sessions.AdminIdentity) -> None:
        async with session.begin():
            await sessions.revoke(session, identity.session_id)

    async def revoke_all(self, session: AsyncSession, identity: sessions.AdminIdentity) -> None:
        async with session.begin():
            await sessions.revoke_user_sessions(session, identity.user_id)

    async def change_password(
        self,
        session: AsyncSession,
        identity: sessions.AdminIdentity,
        *,
        current_password: str,
        new_password: str,
    ) -> None:
        validate_new_password(new_password)
        async with session.begin():
            user = await session.get(AdminUser, identity.user_id)
            if user is None or not passwords.verify_password(user.password_hash, current_password):
                raise ValidationFailed([FieldError("current_password", "wrong_password")])
            user.password_hash = passwords.hash_password(new_password)
            await sessions.revoke_user_sessions(
                session, identity.user_id, except_id=identity.session_id
            )


async def create_admin(session: AsyncSession, email: str, password: str) -> uuid.UUID:
    validate_new_password(password, "password")
    try:
        async with session.begin():
            user = AdminUser(email=email.strip(), password_hash=passwords.hash_password(password))
            session.add(user)
            await session.flush()
            return user.id
    except IntegrityError as exc:
        raise AdminAlreadyExists from exc


async def reset_admin_password(session: AsyncSession, email: str, password: str) -> None:
    """Сброс пароля из CLI: заодно отзывает все сессии пользователя."""
    validate_new_password(password, "password")
    async with session.begin():
        user_id = (
            await session.execute(
                update(AdminUser)
                .where(AdminUser.email == email.strip())
                .values(password_hash=passwords.hash_password(password), is_active=True)
                .returning(AdminUser.id)
            )
        ).scalar_one_or_none()
        if user_id is None:
            raise AdminNotFound
        await sessions.revoke_user_sessions(session, user_id)
