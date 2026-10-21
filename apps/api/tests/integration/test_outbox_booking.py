import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

INSERT = text(
    "INSERT INTO notification_outbox (kind, channel, payload, status, dedupe_key)"
    " VALUES (:kind, :channel, '{}', :status, :key)"
)


async def insert(engine: AsyncEngine, **values: object) -> None:
    params: dict[str, object] = {
        "kind": "lead_created",
        "channel": "log",
        "status": "pending",
        "key": None,
    }
    params.update(values)
    async with engine.begin() as conn:
        await conn.execute(INSERT, params)


async def test_new_channel_status_and_kinds_are_accepted(engine: AsyncEngine) -> None:
    await insert(engine, channel="max_user", kind="booking_confirmed_client")
    await insert(engine, status="cancelled", kind="bot_welcome", channel="max_user")
    for kind in (
        "booking_created_owner",
        "booking_reminder_24h",
        "booking_reminder_2h",
        "booking_cancelled_client",
        "booking_cancelled_owner",
        "booking_rescheduled_client",
    ):
        await insert(engine, kind=kind)


@pytest.mark.parametrize(
    ("column", "value", "constraint"),
    [
        ("kind", "unknown_kind", "ck_notification_outbox_kind_values"),
        ("channel", "sms", "ck_notification_outbox_channel_values"),
        ("status", "done", "ck_notification_outbox_status_values"),
    ],
)
async def test_unknown_values_are_rejected(
    engine: AsyncEngine, column: str, value: str, constraint: str
) -> None:
    with pytest.raises(IntegrityError, match=constraint):
        await insert(engine, **{column: value})


async def test_dedupe_key_is_unique_when_set(engine: AsyncEngine) -> None:
    await insert(engine, key="reminder_24h:abc")
    with pytest.raises(IntegrityError, match="ix_notification_outbox_dedupe_key"):
        await insert(engine, key="reminder_24h:abc")
    await insert(engine, key="reminder_24h:other")


async def test_null_dedupe_keys_do_not_conflict(engine: AsyncEngine) -> None:
    await insert(engine)
    await insert(engine)
