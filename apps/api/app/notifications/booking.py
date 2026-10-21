"""Уведомления о записях: загрузка данных, отправка клиенту в MAX и разбор задач outbox."""

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, runtime_checkable
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog import Business
from app.domain.enums import BookingStatus
from app.logging import get_logger
from app.max import keyboards
from app.max.client import MaxClient
from app.max.render import MessageRenderer
from app.models import Booking, BookingSettings, Resource
from app.notifications.base import Channel
from app.settings import Settings

CLIENT_KINDS = {
    "booking_confirmed_client",
    "booking_reminder_24h",
    "booking_reminder_2h",
    "booking_cancelled_client",
    "booking_rescheduled_client",
}
OWNER_KINDS = {"booking_created_owner", "booking_cancelled_owner"}
# Эти сообщения имеют смысл только для действующей записи (§8.2).
ACTIVE_ONLY_KINDS = {
    "booking_confirmed_client",
    "booking_reminder_24h",
    "booking_reminder_2h",
    "booking_rescheduled_client",
}
REMINDER_KINDS = {"booking_reminder_24h", "booking_reminder_2h"}


@dataclass(frozen=True)
class BookingMessage:
    """Данные записи для текста сообщения. Читаются воркером из БД; в outbox их нет."""

    id: uuid.UUID
    public_number: int
    status: BookingStatus
    service_title: str
    starts_at: datetime
    ends_at: datetime
    resource_name: str
    client_name: str
    client_phone: str
    comment: str | None
    max_user_id: int | None
    cancel_reason: str | None
    rescheduled: bool
    can_change: bool
    change_until: datetime
    business_name: str
    business_phone: str
    business_address: str
    admin_url: str


@runtime_checkable
class OwnerChannel(Protocol):
    name: str

    async def send_booking_owner(self, kind: str, message: BookingMessage, text: str) -> None: ...


async def load_booking_message(
    session: AsyncSession,
    booking_id: uuid.UUID,
    *,
    settings: Settings,
    business: Business,
    now: datetime,
) -> BookingMessage | None:
    row = (
        await session.execute(
            select(Booking, Resource)
            .join(Resource, Resource.id == Booking.resource_id)
            .where(Booking.id == booking_id)
        )
    ).first()
    if row is None:
        return None
    booking, resource = row
    policy = (await session.execute(select(BookingSettings))).scalar_one()
    change_until = booking.starts_at - timedelta(minutes=policy.cancel_deadline_min)
    return BookingMessage(
        id=booking.id,
        public_number=booking.public_number,
        status=booking.status,
        service_title=booking.service_title_snapshot,
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        resource_name=resource.name,
        client_name=booking.client_name,
        client_phone=booking.client_phone_e164,
        comment=booking.comment,
        max_user_id=booking.max_user_id,
        cancel_reason=booking.cancel_reason,
        rescheduled=booking.rescheduled_from_id is not None,
        can_change=booking.status == BookingStatus.CONFIRMED and now <= change_until,
        change_until=change_until,
        business_name=business.name,
        business_phone=business.phone,
        business_address=business.address,
        admin_url=f"{settings.admin_origin.rstrip('/')}/bookings/{booking.id}",
    )


@dataclass(frozen=True)
class Skipped:
    """Задача не отправляется, и повторять её не нужно."""

    reason: str


class BookingDispatcher:
    """Разбирает задачи outbox по записям: клиенту — через Bot API, владельцу — через каналы."""

    def __init__(
        self,
        settings: Settings,
        business: Business,
        channels: Mapping[str, Channel],
        *,
        max_client: MaxClient | None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._settings = settings
        self._business = business
        self._channels = channels
        self._max = max_client
        self._clock = clock
        self._renderer = MessageRenderer(ZoneInfo(business.timezone))

    async def handle(
        self, session: AsyncSession, kind: str, channel: str, payload: dict[str, Any]
    ) -> Skipped | None:
        """None — отправлено; `Skipped` — отменить задачу; исключение — повтор или отказ."""
        if kind == "bot_welcome":
            return await self._bot_welcome(payload)
        if kind not in CLIENT_KINDS | OWNER_KINDS:
            return Skipped("unknown_kind")
        now = self._clock()
        message = await load_booking_message(
            session,
            uuid.UUID(payload["booking_id"]),
            settings=self._settings,
            business=self._business,
            now=now,
        )
        if message is None:
            return Skipped("booking_not_found")
        if kind in OWNER_KINDS:
            return await self._to_owner(kind, channel, message)
        return await self._to_client(kind, message, now)

    async def _to_owner(self, kind: str, channel: str, message: BookingMessage) -> Skipped | None:
        target = self._channels.get(channel)
        if not isinstance(target, OwnerChannel):
            return Skipped("channel_not_configured")
        await target.send_booking_owner(kind, message, self._renderer.render(kind, b=message))
        return None

    async def _to_client(self, kind: str, message: BookingMessage, now: datetime) -> Skipped | None:
        if self._max is None:
            return Skipped("max_not_configured")
        if message.max_user_id is None:
            return Skipped("no_max_user")
        if message.max_user_id < 0:
            return Skipped("demo_user")  # id демо-пользователей не принадлежат реальному MAX
        if kind in ACTIVE_ONLY_KINDS and message.status != BookingStatus.CONFIRMED:
            return Skipped("booking_not_active")
        if kind in REMINDER_KINDS and message.starts_at <= now:
            return Skipped("booking_started")
        text = self._renderer.render(kind, b=message)
        await self._max.send_message(
            message.max_user_id, text, keyboards.my_bookings(self._business.bot_username)
        )
        return None

    async def _bot_welcome(self, payload: dict[str, Any]) -> Skipped | None:
        if self._max is None:
            return Skipped("max_not_configured")
        text = self._renderer.render(
            "bot_welcome", business=self._business, variant=payload.get("variant", "welcome")
        )
        await self._max.send_message(
            int(payload["user_id"]), text, keyboards.book_now(self._business.bot_username)
        )
        get_logger().info("bot_welcome_sent")
        return None
