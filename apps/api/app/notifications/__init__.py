from app.notifications.base import Channel
from app.notifications.channels.email import EmailChannel
from app.notifications.channels.log import LogChannel
from app.notifications.channels.max import MaxChannel
from app.settings import Settings


def build_channels(settings: Settings) -> dict[str, Channel]:
    """Каналы, включённые настройками (тот же набор, что кладёт в outbox LeadService)."""
    available: dict[str, Channel] = {}
    for name in settings.enabled_channels:
        if name == "email":
            available[name] = EmailChannel(settings)
        elif name == "max" and settings.max_bot_token and settings.max_chat_id:
            available[name] = MaxChannel(
                settings.max_bot_token.get_secret_value(),
                settings.max_chat_id,
                settings.admin_origin,
            )
        else:
            available[name] = LogChannel()
    return available
