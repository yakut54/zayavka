from app.logging import get_logger
from app.notifications.base import LeadView


class LogChannel:
    """Для dev/test без SMTP. Персональные данные не пишет — только номер заявки."""

    name = "log"

    async def send_lead_created(self, lead: LeadView) -> None:
        get_logger().info("notification_lead_created", public_number=lead.public_number)
