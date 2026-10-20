import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminSession, AdminUser

TOUCH_INTERVAL = timedelta(minutes=5)
USER_AGENT_MAX = 512


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def tokens_match(token: str, expected_hash: bytes) -> bool:
    return hmac.compare_digest(hash_token(token), expected_hash)


@dataclass(frozen=True, slots=True)
class NewSession:
    session_id: uuid.UUID
    token: str
    csrf_token: str
    max_age: int


@dataclass(frozen=True, slots=True)
class AdminIdentity:
    """Результат проверки сессии; не привязан к SQLAlchemy-сессии запроса."""

    user_id: uuid.UUID
    email: str
    session_id: uuid.UUID
    csrf_token_hash: bytes


async def create_session(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    ip_hash: bytes,
    user_agent: str,
    ttl_hours: int,
) -> NewSession:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    row = AdminSession(
        user_id=user_id,
        token_hash=hash_token(token),
        csrf_token_hash=hash_token(csrf),
        expires_at=func.now() + timedelta(hours=ttl_hours),
        ip_hash=ip_hash,
        user_agent=user_agent[:USER_AGENT_MAX],
    )
    session.add(row)
    await session.flush()
    return NewSession(row.id, token, csrf, ttl_hours * 3600)


async def find_identity(session: AsyncSession, token: str) -> AdminIdentity | None:
    """Активная сессия: не отозвана, не истекла, пользователь активен."""
    row = (
        await session.execute(
            select(
                AdminSession.id,
                AdminSession.csrf_token_hash,
                AdminSession.last_seen_at,
                AdminUser.id.label("user_id"),
                AdminUser.email,
                func.now().label("now"),
            )
            .join(AdminUser, AdminUser.id == AdminSession.user_id)
            .where(
                AdminSession.token_hash == hash_token(token),
                AdminSession.revoked_at.is_(None),
                AdminSession.expires_at > func.now(),
                AdminUser.is_active.is_(True),
            )
        )
    ).one_or_none()
    if row is None:
        return None
    last_seen: datetime = row.last_seen_at
    if row.now - last_seen >= TOUCH_INTERVAL:
        await session.execute(
            update(AdminSession).where(AdminSession.id == row.id).values(last_seen_at=func.now())
        )
    return AdminIdentity(row.user_id, row.email, row.id, bytes(row.csrf_token_hash))


async def revoke(session: AsyncSession, session_id: uuid.UUID) -> None:
    await session.execute(
        update(AdminSession)
        .where(AdminSession.id == session_id, AdminSession.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )


async def revoke_user_sessions(
    session: AsyncSession, user_id: uuid.UUID, *, except_id: uuid.UUID | None = None
) -> None:
    stmt = (
        update(AdminSession)
        .where(AdminSession.user_id == user_id, AdminSession.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )
    if except_id is not None:
        stmt = stmt.where(AdminSession.id != except_id)
    await session.execute(stmt)
