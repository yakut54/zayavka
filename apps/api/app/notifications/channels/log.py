from app.logging import get_logger
from app.notifications.base import LeadView
from app.notifications.booking import BookingMessage


class LogChannel:
    """Для dev/test без SMTP. Персональные данные не пишет — только номер заявки."""

    name = "log"

    async def send_lead_created(self, lead: LeadView) -> None:
        get_logger().info("notification_lead_created", public_number=lead.public_number)

    async def send_booking_owner(self, kind: str, message: BookingMessage, text: str) -> None:
        get_logger().info(
            "notification_booking_owner", kind=kind, public_number=message.public_number
        )
