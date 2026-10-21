import json
import uuid
from collections.abc import Mapping
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.logging import get_logger
from app.max.client import MaxApiError
from app.notifications.base import Channel, LeadView
from app.notifications.booking import BookingDispatcher, Skipped

BACKOFF_S = [60, 300, 900, 3600, 21600]  # 1 мин, 5 мин, 15 мин, 1 ч, 6 ч
MAX_ATTEMPTS = 5
BATCH_SIZE = 20
ERROR_MAX = 500

_SELECT_DUE = text(
    """
    SELECT id, kind, channel, payload, attempts FROM notification_outbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT :limit
    FOR UPDATE SKIP LOCKED
    """
)


def load_service_titles(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    titles = data.get("titles", {})
    return {str(k): str(v) for k, v in titles.items()}


async def load_lead_view(
    session: AsyncSession, lead_id: uuid.UUID, titles: Mapping[str, str]
) -> LeadView:
    row = (
        await session.execute(
            text(
                "SELECT id, public_number, name, phone_e164, email, message, service_slug"
                " FROM leads WHERE id = :id"
            ),
            {"id": lead_id},
        )
    ).one()
    return LeadView(
        id=row.id,
        public_number=row.public_number,
        name=row.name,
        phone_e164=row.phone_e164,
        email=row.email,
        message=row.message,
        service_slug=row.service_slug,
        service_title=titles.get(row.service_slug) if row.service_slug else None,
    )


async def mark_sent(session: AsyncSession, outbox_id: uuid.UUID) -> None:
    await session.execute(
        text(
            "UPDATE notification_outbox SET status = 'sent', sent_at = now(),"
            " attempts = attempts + 1, last_error = NULL WHERE id = :id"
        ),
        {"id": outbox_id},
    )


async def mark_cancelled(session: AsyncSession, outbox_id: uuid.UUID, reason: str) -> None:
    """Задача снята без отправки (напр. запись отменена, нет получателя) — не ошибка."""
    await session.execute(
        text("UPDATE notification_outbox SET status = 'cancelled', last_error = :r WHERE id = :id"),
        {"id": outbox_id, "r": reason},
    )


async def mark_failed(
    session: AsyncSession, outbox_id: uuid.UUID, attempts: int, error: Exception
) -> None:
    """Повторять бессмысленно (неверный токен, пользователь заблокировал бота)."""
    get_logger().error("notification_failed", outbox_id=str(outbox_id), reason=type(error).__name__)
    await session.execute(
        text(
            "UPDATE notification_outbox SET status = 'failed', attempts = :a, last_error = :e"
            " WHERE id = :id"
        ),
        {"id": outbox_id, "a": attempts + 1, "e": f"{type(error).__name__}: {error}"[:ERROR_MAX]},
    )


async def schedule_retry(
    session: AsyncSession,
    outbox_id: uuid.UUID,
    attempts: int,
    error: Exception,
    backoff: list[int] = BACKOFF_S,
) -> None:
    """attempts — число попыток до этой. Пятая неудача переводит задачу в failed."""
    new_attempts = attempts + 1
    message = f"{type(error).__name__}: {error}"[:ERROR_MAX]
    if new_attempts >= MAX_ATTEMPTS:
        get_logger().error("notification_failed", outbox_id=str(outbox_id), attempts=new_attempts)
        await session.execute(
            text(
                "UPDATE notification_outbox SET status = 'failed', attempts = :a,"
                " last_error = :e WHERE id = :id"
            ),
            {"id": outbox_id, "a": new_attempts, "e": message},
        )
        return
    await session.execute(
        text(
            "UPDATE notification_outbox SET attempts = :a, last_error = :e,"
            " next_attempt_at = now() + make_interval(secs => :d) WHERE id = :id"
        ),
        {"id": outbox_id, "a": new_attempts, "e": message, "d": backoff[new_attempts - 1]},
    )


async def process_batch(
    session: AsyncSession,
    channels: Mapping[str, Channel],
    titles: Mapping[str, str] | None = None,
    *,
    dispatcher: BookingDispatcher | None = None,
) -> int:
    """Забирает пачку задач (SKIP LOCKED) и отправляет. Возвращает число взятых задач."""
    titles = titles or {}
    async with session.begin():
        rows = (await session.execute(_SELECT_DUE, {"limit": BATCH_SIZE})).all()
        for row in rows:
            try:
                if row.kind == "lead_created":
                    lead = await load_lead_view(session, uuid.UUID(row.payload["lead_id"]), titles)
                    await channels[row.channel].send_lead_created(lead)
                    await mark_sent(session, row.id)
                    continue
                outcome = (
                    await dispatcher.handle(session, row.kind, row.channel, row.payload)
                    if dispatcher is not None
                    else Skipped("bookings_not_configured")
                )
                if isinstance(outcome, Skipped):
                    await mark_cancelled(session, row.id, outcome.reason)
                else:
                    await mark_sent(session, row.id)
            except MaxApiError as exc:
                if exc.retryable:
                    await schedule_retry(session, row.id, row.attempts, exc)
                else:
                    await mark_failed(session, row.id, row.attempts, exc)
            except Exception as exc:
                await schedule_retry(session, row.id, row.attempts, exc)
    return len(rows)
