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


async def delete_expired_sessions(session: AsyncSession) -> int:
    result = await session.execute(text("DELETE FROM admin_sessions WHERE expires_at < now()"))
    return int(result.rowcount)  # type: ignore[attr-defined]


async def run_maintenance(session: AsyncSession, retention_days: int) -> MaintenanceResult:
    async with session.begin():
        return MaintenanceResult(
            rate_limits_deleted=await ratelimit.cleanup(session),
            sessions_deleted=await delete_expired_sessions(session),
            leads_anonymized=await anonymize_expired(session, retention_days),
        )
