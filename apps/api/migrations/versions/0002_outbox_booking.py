"""outbox: канал max_user, статус cancelled, виды уведомлений о записях, dedupe_key

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

KINDS = (
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
OLD_KINDS = ("lead_created",)


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.drop_constraint("ck_notification_outbox_channel_values", "notification_outbox")
    op.drop_constraint("ck_notification_outbox_status_values", "notification_outbox")
    op.create_check_constraint(
        "channel_values",
        "notification_outbox",
        "channel IN ('email', 'max', 'max_user', 'log')",
    )
    op.create_check_constraint(
        "status_values",
        "notification_outbox",
        "status IN ('pending', 'sent', 'failed', 'cancelled')",
    )
    op.create_check_constraint("kind_values", "notification_outbox", f"kind IN ({_in(KINDS)})")
    op.add_column("notification_outbox", sa.Column("dedupe_key", sa.Text(), nullable=True))
    op.create_index(
        "ix_notification_outbox_dedupe_key",
        "notification_outbox",
        ["dedupe_key"],
        unique=True,
        postgresql_where=sa.text("dedupe_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notification_outbox_dedupe_key", "notification_outbox")
    op.drop_column("notification_outbox", "dedupe_key")
    op.drop_constraint("ck_notification_outbox_kind_values", "notification_outbox")
    op.execute(
        "DELETE FROM notification_outbox WHERE kind NOT IN ('lead_created')"
        " OR channel NOT IN ('email', 'max', 'log') OR status NOT IN ('pending', 'sent', 'failed')"
    )
    op.drop_constraint("ck_notification_outbox_status_values", "notification_outbox")
    op.drop_constraint("ck_notification_outbox_channel_values", "notification_outbox")
    op.create_check_constraint(
        "channel_values",
        "notification_outbox",
        "channel IN ('email', 'max', 'log')",
    )
    op.create_check_constraint(
        "status_values",
        "notification_outbox",
        "status IN ('pending', 'sent', 'failed')",
    )
