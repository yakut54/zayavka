"""Команды сопровождения бота: подписка на вебхук и проверка связи (`app.cli max-*`)."""

from dataclasses import dataclass

from app.max.client import MaxApiError, MaxClient
from app.settings import Settings

WEBHOOK_PATH = "/api/v1/max/webhook"


@dataclass(frozen=True)
class CheckReport:
    token_valid: bool
    bot_username: str | None
    subscribed: bool
    problems: list[str]

    @property
    def ok(self) -> bool:
        return not self.problems


def webhook_url(settings: Settings) -> str:
    if settings.max_webhook_url:
        return settings.max_webhook_url
    return f"{settings.site_origin.rstrip('/')}{WEBHOOK_PATH}"


def require_config(settings: Settings) -> tuple[str, str]:
    missing = [
        name
        for name, value in (
            ("MAX_BOT_TOKEN", settings.max_bot_token),
            ("MAX_WEBHOOK_SECRET", settings.max_webhook_secret),
        )
        if value is None
    ]
    if missing or settings.max_bot_token is None or settings.max_webhook_secret is None:
        raise SystemExit(f"Не заданы: {', '.join(missing)}")
    return settings.max_bot_token.get_secret_value(), settings.max_webhook_secret.get_secret_value()


async def subscribe(client: MaxClient, settings: Settings) -> str:
    """Идемпотентно: старую подписку на наш адрес удаляем и создаём заново с текущим секретом.

    GET /subscriptions не возвращает секрет, поэтому по совпадению адреса нельзя понять,
    актуален ли он; со старым секретом все вебхуки отвергались бы, и через 8 часов MAX
    отписал бы бота.
    """
    _, secret = require_config(settings)
    url = webhook_url(settings)
    existing = [s for s in await client.get_subscriptions() if s.get("url") == url]
    if existing:
        await client.unsubscribe(url)
    await client.subscribe(url, secret)
    return "переподписан" if existing else "подписан"


async def check(client: MaxClient, settings: Settings) -> CheckReport:
    problems: list[str] = []
    username: str | None = None
    valid = False
    subscribed = False
    try:
        me = await client.get_me()
        valid = True
        username = me.get("username")
    except MaxApiError as exc:
        problems.append(f"токен не принят или API недоступен: {exc}")
    if valid:
        try:
            url = webhook_url(settings)
            subscribed = any(s.get("url") == url for s in await client.get_subscriptions())
        except MaxApiError as exc:
            problems.append(f"не удалось получить подписки: {exc}")
        else:
            if not subscribed:
                problems.append("нет подписки на вебхук — выполните max-subscribe")
    return CheckReport(valid, username, subscribed, problems)
