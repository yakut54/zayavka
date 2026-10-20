"""initial schema

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

UUIDV7 = sa.text("uuidv7()")
NOW = sa.text("now()")
LEAD_STATUSES = ("new", "in_progress", "done", "spam", "archived")


def _id() -> sa.Column[object]:
    return sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=UUIDV7)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    lead_status = pg.ENUM(*LEAD_STATUSES, name="lead_status", create_type=False)
    lead_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "admin_users",
        _id(),
        sa.Column("email", pg.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("email", name="uq_admin_users_email"),
    )

    op.create_table(
        "admin_sessions",
        _id(),
        sa.Column(
            "user_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("admin_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("csrf_token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("ip_hash", sa.LargeBinary(), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_admin_sessions_token_hash"),
    )
    op.create_index("ix_admin_sessions_expires_at", "admin_sessions", ["expires_at"])
    op.create_index("ix_admin_sessions_user_id", "admin_sessions", ["user_id"])

    op.create_table(
        "consents",
        _id(),
        sa.Column("policy_version", sa.Text(), nullable=False),
        sa.Column("consent_text_sha256", sa.LargeBinary(), nullable=False),
        sa.Column("ip_hash", sa.LargeBinary(), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=False),
        sa.Column("given_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
    )

    op.create_table(
        "leads",
        _id(),
        sa.Column("public_number", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("phone_e164", sa.Text(), nullable=False),
        sa.Column("email", pg.CITEXT()),
        sa.Column("message", sa.Text()),
        sa.Column("service_slug", sa.Text()),
        sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'site'")),
        sa.Column("utm", pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", lead_status, nullable=False, server_default=sa.text("'new'")),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "consent_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("consents.id"),
            nullable=False,
        ),
        sa.Column("anonymized_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.UniqueConstraint("public_number", name="uq_leads_public_number"),
        sa.CheckConstraint("char_length(name) BETWEEN 2 AND 100", name="name_len"),
        sa.CheckConstraint("phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'", name="phone_format"),
        sa.CheckConstraint("char_length(message) <= 2000", name="message_len"),
        sa.CheckConstraint("source IN ('site', 'max')", name="source_values"),
    )
    op.create_index("ix_leads_status_created_at", "leads", ["status", sa.text("created_at DESC")])
    op.create_index("ix_leads_created_at", "leads", [sa.text("created_at DESC")])

    op.create_table(
        "lead_events",
        _id(),
        sa.Column(
            "lead_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=True
        ),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.CheckConstraint(
            "type IN ('created', 'status_changed', 'note_added')", name="type_values"
        ),
    )
    op.create_index("ix_lead_events_lead_id", "lead_events", ["lead_id"])

    op.create_table(
        "notification_outbox",
        _id(),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("channel", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW
        ),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=NOW),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("channel IN ('email', 'max', 'log')", name="channel_values"),
        sa.CheckConstraint("status IN ('pending', 'sent', 'failed')", name="status_values"),
    )
    op.create_index(
        "ix_outbox_pending",
        "notification_outbox",
        ["next_attempt_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.create_table(
        "rate_limits",
        sa.Column("bucket", sa.Text(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("bucket", "window_start", name="pk_rate_limits"),
    )


def downgrade() -> None:
    for table in (
        "rate_limits",
        "notification_outbox",
        "lead_events",
        "leads",
        "consents",
        "admin_sessions",
        "admin_users",
    ):
        op.drop_table(table)
    op.execute("DROP TYPE IF EXISTS lead_status")
    op.execute("DROP EXTENSION IF EXISTS citext")
