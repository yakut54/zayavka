"""Тексты сообщений бота: простой текст без разметки, данные клиента выводятся как есть."""

from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from babel.dates import format_date
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from app.max.client import TEXT_LIMIT

TEMPLATES = Path(__file__).parent / "messages"
ELLIPSIS = "…"


def clip(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[: limit - 1].rstrip() + ELLIPSIS


def make_environment(tz: ZoneInfo) -> Environment:
    # autoescape выключен намеренно: сообщения — простой текст, `format` не передаётся.
    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=False,  # noqa: S701
        undefined=StrictUndefined,
        trim_blocks=False,
        keep_trailing_newline=False,
    )

    def local(moment: datetime) -> datetime:
        return moment.astimezone(tz)

    env.filters["date_long"] = lambda m: (
        f"{format_date(local(m), 'd MMMM', locale='ru')} "
        f"({format_date(local(m), 'EEEE', locale='ru')})"
    )
    env.filters["date_short"] = lambda m: format_date(local(m), "d MMMM", locale="ru")
    env.filters["hm"] = lambda m: local(m).strftime("%H:%M")
    env.filters["clip"] = clip
    return env


class MessageRenderer:
    def __init__(self, tz: ZoneInfo) -> None:
        self._env = make_environment(tz)

    def render(self, template: str, **context: Any) -> str:
        text = self._env.get_template(f"{template}.txt.j2").render(**context).strip()
        return clip(text, TEXT_LIMIT)
