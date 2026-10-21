"""таблицы онлайн-записи: ресурсы, графики, исключения, настройки, записи, события, max_updates

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

STATUSES = (
    "confirmed",
    "cancelled_by_client",
    "cancelled_by_business",
    "completed",
    "no_show",
    "rescheduled",
)
UUIDV7 = sa.text("uuidv7()")
NOW = sa.text("now()")


def _pk() -> sa.Column[object]:
    return sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=UUIDV7)


def _ts(name: str) -> sa.Column[object]:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=NOW)


def _resource_fk() -> sa.Column[object]:
    return sa.Column(
        "resource_id",
        pg.UUID(as_uuid=True),
        sa.ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
    )


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    status = pg.ENUM(*STATUSES, name="booking_status", create_type=False)
    status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "resources",
        _pk(),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("title", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        _ts("created_at"),
        _ts("updated_at"),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 80", name="name_len"),
        sa.CheckConstraint("char_length(title) <= 80", name="title_len"),
    )
    op.create_table(
        "resource_services",
        _resource_fk(),
        sa.Column("service_slug", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("resource_id", "service_slug", name="pk_resource_services"),
    )
    op.create_table(
        "working_hours",
        _pk(),
        _resource_fk(),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("start_min", sa.SmallInteger(), nullable=False),
        sa.Column("end_min", sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("weekday BETWEEN 1 AND 7", name="weekday_range"),
        sa.CheckConstraint("start_min BETWEEN 0 AND 1439", name="start_range"),
        sa.CheckConstraint("end_min BETWEEN 1 AND 1440", name="end_range"),
        sa.CheckConstraint("end_min > start_min", name="interval_order"),
    )
    op.execute(
        "ALTER TABLE working_hours ADD CONSTRAINT ex_working_hours_no_overlap "
        "EXCLUDE USING gist (resource_id WITH =, weekday WITH =, "
        "int4range(start_min, end_min) WITH &&)"
    )
    op.create_table(
        "schedule_exceptions",
        _pk(),
        _resource_fk(),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("intervals", pg.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("note", sa.Text()),
        sa.CheckConstraint("kind IN ('day_off', 'custom_hours')", name="kind_values"),
        sa.CheckConstraint("jsonb_typeof(intervals) = 'array'", name="intervals_array"),
        sa.CheckConstraint("char_length(note) <= 200", name="note_len"),
        sa.UniqueConstraint("resource_id", "date", name="uq_schedule_exceptions_resource_id_date"),
    )
    op.create_table(
        "booking_settings",
        sa.Column("id", sa.SmallInteger(), primary_key=True, autoincrement=False),
        sa.Column("slot_step_min", sa.SmallInteger(), nullable=False, server_default=sa.text("15")),
        sa.Column("min_lead_min", sa.Integer(), nullable=False, server_default=sa.text("60")),
        sa.Column("horizon_days", sa.SmallInteger(), nullable=False, server_default=sa.text("30")),
        sa.Column(
            "cancel_deadline_min", sa.Integer(), nullable=False, server_default=sa.text("120")
        ),
        sa.Column(
            "reminders_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        _ts("updated_at"),
        sa.CheckConstraint("id = 1", name="single_row"),
        sa.CheckConstraint("slot_step_min IN (5, 10, 15, 20, 30, 60)", name="slot_step_values"),
        sa.CheckConstraint("min_lead_min BETWEEN 0 AND 10080", name="min_lead_range"),
        sa.CheckConstraint("horizon_days BETWEEN 1 AND 90", name="horizon_range"),
        sa.CheckConstraint("cancel_deadline_min BETWEEN 0 AND 10080", name="cancel_deadline_range"),
    )
    op.execute("INSERT INTO booking_settings (id) VALUES (1)")

    op.create_table(
        "bookings",
        _pk(),
        sa.Column("public_number", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column(
            "resource_id", pg.UUID(as_uuid=True), sa.ForeignKey("resources.id"), nullable=False
        ),
        sa.Column("service_slug", sa.Text(), nullable=False),
        sa.Column("service_title_snapshot", sa.Text(), nullable=False),
        sa.Column("duration_min", sa.SmallInteger(), nullable=False),
        sa.Column("buffer_min", sa.SmallInteger(), nullable=False),
        sa.Column("price_from_snapshot", sa.Integer()),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("blocked", pg.TSTZRANGE(), nullable=False),
        sa.Column("status", status, nullable=False, server_default=sa.text("'confirmed'")),
        sa.Column("client_name", sa.Text(), nullable=False),
        sa.Column("client_phone_e164", sa.Text(), nullable=False),
        sa.Column("phone_source", sa.Text(), nullable=False),
        sa.Column("max_user_id", sa.BigInteger()),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("consent_id", pg.UUID(as_uuid=True), sa.ForeignKey("consents.id")),
        sa.Column("idempotency_key", sa.Text()),
        sa.Column("rescheduled_from_id", pg.UUID(as_uuid=True), sa.ForeignKey("bookings.id")),
        sa.Column("cancel_reason", sa.Text()),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("anonymized_at", sa.DateTime(timezone=True)),
        _ts("created_at"),
        _ts("updated_at"),
        sa.UniqueConstraint("public_number", name="uq_bookings_public_number"),
        sa.CheckConstraint("ends_at > starts_at", name="time_order"),
        sa.CheckConstraint(
            "lower(blocked) = starts_at AND NOT isempty(blocked)", name="blocked_matches"
        ),
        sa.CheckConstraint("char_length(client_name) BETWEEN 2 AND 100", name="name_len"),
        sa.CheckConstraint("client_phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'", name="phone_format"),
        sa.CheckConstraint(
            "phone_source IN ('max_contact', 'manual', 'admin')", name="phone_source_values"
        ),
        sa.CheckConstraint("source IN ('max', 'admin')", name="source_values"),
        sa.CheckConstraint("char_length(comment) <= 500", name="comment_len"),
        sa.CheckConstraint("char_length(cancel_reason) <= 300", name="cancel_reason_len"),
        sa.CheckConstraint("source = 'admin' OR consent_id IS NOT NULL", name="consent_required"),
    )
    op.execute(
        "ALTER TABLE bookings ADD CONSTRAINT ex_bookings_no_overlap "
        "EXCLUDE USING gist (resource_id WITH =, blocked WITH &&) "
        "WHERE (status = 'confirmed')"
    )
    op.create_index("ix_bookings_resource_id_starts_at", "bookings", ["resource_id", "starts_at"])
    op.create_index(
        "ix_bookings_max_user_id_starts_at",
        "bookings",
        ["max_user_id", sa.text("starts_at DESC")],
        postgresql_where=sa.text("max_user_id IS NOT NULL"),
    )
    op.create_index(
        "ix_bookings_max_user_id_idempotency_key",
        "bookings",
        ["max_user_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    op.create_table(
        "booking_events",
        _pk(),
        sa.Column(
            "booking_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("admin_users.id")),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False),
        _ts("created_at"),
        sa.CheckConstraint("actor IN ('client', 'admin', 'system')", name="actor_values"),
        sa.CheckConstraint(
            "type IN ('created', 'cancelled', 'rescheduled', 'status_changed', 'note_added')",
            name="type_values",
        ),
    )
    op.create_index("ix_booking_events_booking_id", "booking_events", ["booking_id"])

    op.create_table(
        "max_updates",
        sa.Column("body_sha256", sa.LargeBinary(), primary_key=True),
        _ts("received_at"),
    )
    op.create_index("ix_max_updates_received_at", "max_updates", ["received_at"])


def downgrade() -> None:
    for table in (
        "max_updates",
        "booking_events",
        "bookings",
        "booking_settings",
        "schedule_exceptions",
        "working_hours",
        "resource_services",
        "resources",
    ):
        op.drop_table(table)
    op.execute("DROP TYPE IF EXISTS booking_status")
    op.execute("DROP EXTENSION IF EXISTS btree_gist")
