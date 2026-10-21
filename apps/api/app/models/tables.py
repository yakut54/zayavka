import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, TSTZRANGE, ExcludeConstraint, Range
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import BookingStatus, LeadStatus
from app.models.base import Base

NOW = text("now()")

OUTBOX_KINDS = (
    "lead_created",
    "booking_created_owner",
    "booking_confirmed_client",
    "booking_reminder_24h",
    "booking_reminder_2h",
    "booking_cancelled_client",
    "booking_cancelled_owner",
    "booking_rescheduled_client",
    "bot_welcome",
)


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


UUIDV7 = text("uuidv7()")

lead_status_enum = PGEnum(
    LeadStatus,
    name="lead_status",
    values_callable=lambda e: [m.value for m in e],
    create_type=False,
)

booking_status_enum = PGEnum(
    BookingStatus,
    name="booking_status",
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
    dedupe_key: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("channel IN ('email', 'max', 'max_user', 'log')", name="channel_values"),
        CheckConstraint(
            "status IN ('pending', 'sent', 'failed', 'cancelled')", name="status_values"
        ),
        CheckConstraint(f"kind IN ({_in(OUTBOX_KINDS)})", name="kind_values"),
        Index(
            "ix_notification_outbox_dedupe_key",
            "dedupe_key",
            unique=True,
            postgresql_where=text("dedupe_key IS NOT NULL"),
        ),
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


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()

    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 80", name="name_len"),
        CheckConstraint("char_length(title) <= 80", name="title_len"),
    )


class ResourceService(Base):
    __tablename__ = "resource_services"

    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True
    )
    service_slug: Mapped[str] = mapped_column(Text, primary_key=True)


class WorkingHours(Base):
    __tablename__ = "working_hours"

    id: Mapped[uuid.UUID] = _uuid_pk()
    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    end_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = (
        CheckConstraint("weekday BETWEEN 1 AND 7", name="weekday_range"),
        CheckConstraint("start_min BETWEEN 0 AND 1439", name="start_range"),
        CheckConstraint("end_min BETWEEN 1 AND 1440", name="end_range"),
        CheckConstraint("end_min > start_min", name="interval_order"),
        ExcludeConstraint(
            ("resource_id", "="),
            ("weekday", "="),
            (text("int4range(start_min, end_min)"), "&&"),
            name="ex_working_hours_no_overlap",
            using="gist",
        ),
    )


class ScheduleException(Base):
    __tablename__ = "schedule_exceptions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    resource_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    intervals: Mapped[list[dict[str, int]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    note: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("kind IN ('day_off', 'custom_hours')", name="kind_values"),
        CheckConstraint("jsonb_typeof(intervals) = 'array'", name="intervals_array"),
        CheckConstraint("char_length(note) <= 200", name="note_len"),
        UniqueConstraint("resource_id", "date"),
    )


class BookingSettings(Base):
    __tablename__ = "booking_settings"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    slot_step_min: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("15")
    )
    min_lead_min: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"))
    horizon_days: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("30")
    )
    cancel_deadline_min: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("120")
    )
    reminders_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    updated_at: Mapped[datetime] = _now()

    __table_args__ = (
        CheckConstraint("id = 1", name="single_row"),
        CheckConstraint("slot_step_min IN (5, 10, 15, 20, 30, 60)", name="slot_step_values"),
        CheckConstraint("min_lead_min BETWEEN 0 AND 10080", name="min_lead_range"),
        CheckConstraint("horizon_days BETWEEN 1 AND 90", name="horizon_range"),
        CheckConstraint("cancel_deadline_min BETWEEN 0 AND 10080", name="cancel_deadline_range"),
    )


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = _uuid_pk()
    public_number: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), nullable=False, unique=True
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resources.id"), nullable=False)
    service_slug: Mapped[str] = mapped_column(Text, nullable=False)
    service_title_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    duration_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    buffer_min: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    price_from_snapshot: Mapped[int | None] = mapped_column(Integer)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    blocked: Mapped[Range[datetime]] = mapped_column(TSTZRANGE, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        booking_status_enum, nullable=False, server_default=text("'confirmed'")
    )
    client_name: Mapped[str] = mapped_column(Text, nullable=False)
    client_phone_e164: Mapped[str] = mapped_column(Text, nullable=False)
    phone_source: Mapped[str] = mapped_column(Text, nullable=False)
    max_user_id: Mapped[int | None] = mapped_column(BigInteger)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    consent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("consents.id"))
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    rescheduled_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bookings.id"))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()

    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="time_order"),
        CheckConstraint(
            "lower(blocked) = starts_at AND NOT isempty(blocked)", name="blocked_matches"
        ),
        CheckConstraint("char_length(client_name) BETWEEN 2 AND 100", name="name_len"),
        CheckConstraint("client_phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'", name="phone_format"),
        CheckConstraint(
            "phone_source IN ('max_contact', 'manual', 'admin')", name="phone_source_values"
        ),
        CheckConstraint("source IN ('max', 'admin')", name="source_values"),
        CheckConstraint("char_length(comment) <= 500", name="comment_len"),
        CheckConstraint("char_length(cancel_reason) <= 300", name="cancel_reason_len"),
        CheckConstraint("source = 'admin' OR consent_id IS NOT NULL", name="consent_required"),
        ExcludeConstraint(
            ("resource_id", "="),
            ("blocked", "&&"),
            name="ex_bookings_no_overlap",
            using="gist",
            where=text("status = 'confirmed'"),
        ),
        Index("ix_bookings_resource_id_starts_at", "resource_id", "starts_at"),
        Index(
            "ix_bookings_max_user_id_starts_at",
            "max_user_id",
            text("starts_at DESC"),
            postgresql_where=text("max_user_id IS NOT NULL"),
        ),
        Index(
            "ix_bookings_max_user_id_idempotency_key",
            "max_user_id",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
    )


class BookingEvent(Base):
    __tablename__ = "booking_events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("admin_users.id"))
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = _now()

    __table_args__ = (
        CheckConstraint("actor IN ('client', 'admin', 'system')", name="actor_values"),
        CheckConstraint(
            "type IN ('created', 'cancelled', 'rescheduled', 'status_changed', 'note_added')",
            name="type_values",
        ),
        Index("ix_booking_events_booking_id", "booking_id"),
    )


class MaxUpdate(Base):
    __tablename__ = "max_updates"

    body_sha256: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    received_at: Mapped[datetime] = _now()

    __table_args__ = (Index("ix_max_updates_received_at", "received_at"),)
