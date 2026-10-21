from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import ratelimit

ANONYMIZED_NAME = "Удалено"
ANONYMIZED_PHONE = "+70000000000"


@dataclass(frozen=True, slots=True)
class MaintenanceResult:
    rate_limits_deleted: int
    sessions_deleted: int
    leads_anonymized: int
    bookings_completed: int = 0
    bookings_anonymized: int = 0
    max_updates_deleted: int = 0


async def anonymize_expired(session: AsyncSession, retention_days: int) -> int:
    """Раздел 14: имя, телефон, email, сообщение и текст заметок заменяются; статистика остаётся."""
    result = await session.execute(
        text(
            """
            UPDATE leads SET name = :name, phone_e164 = :phone, email = NULL, message = NULL,
                   anonymized_at = now(), updated_at = now()
            WHERE anonymized_at IS NULL
              AND created_at < now() - make_interval(days => :days)
            RETURNING id
            """
        ),
        {"name": ANONYMIZED_NAME, "phone": ANONYMIZED_PHONE, "days": retention_days},
    )
    ids = [row.id for row in result]
    if ids:
        await session.execute(
            text(
                "UPDATE lead_events SET payload = jsonb_build_object('text', CAST(:name AS text))"
                " WHERE type = 'note_added' AND lead_id = ANY(:ids)"
            ),
            {"name": ANONYMIZED_NAME, "ids": ids},
        )
    return len(ids)


async def complete_past_bookings(session: AsyncSession) -> int:
    """§8.5: подтверждённые записи, закончившиеся более 12 часов назад, считаются состоявшимися."""
    result = await session.execute(
        text(
            """
            UPDATE bookings SET status = 'completed', version = version + 1, updated_at = now()
            WHERE status = 'confirmed' AND ends_at < now() - interval '12 hours'
            RETURNING id
            """
        )
    )
    ids = [row.id for row in result]
    for booking_id in ids:
        await session.execute(
            text(
                "INSERT INTO booking_events (booking_id, actor, type, payload)"
                " VALUES (:id, 'system', 'status_changed', CAST(:p AS jsonb))"
            ),
            {"id": booking_id, "p": '{"status": "completed", "auto": true}'},
        )
    return len(ids)


async def anonymize_bookings(session: AsyncSession, retention_days: int) -> int:
    """Как заявки (§14), плюс отвязка от пользователя MAX и удаление комментария."""
    result = await session.execute(
        text(
            """
            UPDATE bookings SET client_name = :name, client_phone_e164 = :phone,
                   max_user_id = NULL, comment = NULL, cancel_reason = NULL,
                   anonymized_at = now(), updated_at = now()
            WHERE anonymized_at IS NULL AND created_at < now() - make_interval(days => :days)
            """
        ),
        {"name": ANONYMIZED_NAME, "phone": ANONYMIZED_PHONE, "days": retention_days},
    )
    return int(result.rowcount)  # type: ignore[attr-defined]


async def delete_old_max_updates(session: AsyncSession) -> int:
    result = await session.execute(
        text("DELETE FROM max_updates WHERE received_at < now() - interval '7 days'")
    )
    return int(result.rowcount)  # type: ignore[attr-defined]


async def delete_expired_sessions(session: AsyncSession) -> int:
    result = await session.execute(text("DELETE FROM admin_sessions WHERE expires_at < now()"))
    return int(result.rowcount)  # type: ignore[attr-defined]


async def run_maintenance(session: AsyncSession, retention_days: int) -> MaintenanceResult:
    async with session.begin():
        return MaintenanceResult(
            rate_limits_deleted=await ratelimit.cleanup(session),
            sessions_deleted=await delete_expired_sessions(session),
            leads_anonymized=await anonymize_expired(session, retention_days),
            bookings_completed=await complete_past_bookings(session),
            bookings_anonymized=await anonymize_bookings(session, retention_days),
            max_updates_deleted=await delete_old_max_updates(session),
        )
