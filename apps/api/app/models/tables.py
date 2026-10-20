import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    LargeBinary,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import LeadStatus
from app.models.base import Base

NOW = text("now()")
UUIDV7 = text("uuidv7()")

lead_status_enum = PGEnum(
    LeadStatus,
    name="lead_status",
    values_callable=lambda e: [m.value for m in e],
    create_type=False,
)


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=UUIDV7)


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=NOW)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = _now()
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, unique=True)
    csrf_token_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime] = _now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    user_agent: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_admin_sessions_expires_at", "expires_at"),
        Index("ix_admin_sessions_user_id", "user_id"),
    )


class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[uuid.UUID] = _uuid_pk()
    policy_version: Mapped[str] = mapped_column(Text, nullable=False)
    consent_text_sha256: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    ip_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    user_agent: Mapped[str] = mapped_column(Text, nullable=False)
    given_at: Mapped[datetime] = _now()


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = _uuid_pk()
    public_number: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), nullable=False, unique=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    phone_e164: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(CITEXT)
    message: Mapped[str | None] = mapped_column(Text)
    service_slug: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'site'"))
    utm: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    status: Mapped[LeadStatus] = mapped_column(
        lead_status_enum, nullable=False, server_default=text("'new'")
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    consent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consents.id"), nullable=False)
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()

    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 2 AND 100", name="name_len"),
        CheckConstraint("phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'", name="phone_format"),
        CheckConstraint("char_length(message) <= 2000", name="message_len"),
        CheckConstraint("source IN ('site', 'max')", name="source_values"),
        Index("ix_leads_status_created_at", "status", text("created_at DESC")),
        Index("ix_leads_created_at", text("created_at DESC")),
    )


class LeadEvent(Base):
    __tablename__ = "lead_events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("admin_users.id"))
    type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = _now()

    __table_args__ = (
        CheckConstraint("type IN ('created', 'status_changed', 'note_added')", name="type_values"),
        Index("ix_lead_events_lead_id", "lead_id"),
    )


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"

    id: Mapped[uuid.UUID] = _uuid_pk()
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=NOW
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("channel IN ('email', 'max', 'log')", name="channel_values"),
        CheckConstraint("status IN ('pending', 'sent', 'failed')", name="status_values"),
        Index(
            "ix_outbox_pending",
            "next_attempt_at",
            postgresql_where=text("status = 'pending'"),
        ),
    )


class RateLimit(Base):
    __tablename__ = "rate_limits"

    bucket: Mapped[str] = mapped_column(Text, primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    hits: Mapped[int] = mapped_column(Integer, nullable=False)
