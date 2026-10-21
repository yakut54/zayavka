"""Клавиатуры бота. Поля кнопок — по OpenAPI-схеме MAX (OpenAppButton)."""

from typing import Any

BUTTON_TEXT_LIMIT = 128
START_PARAM_LIMIT = 512


def inline_keyboard(rows: list[list[dict[str, Any]]]) -> dict[str, Any]:
    return {"type": "inline_keyboard", "payload": {"buttons": rows}}


def open_app_button(text: str, bot_username: str, payload: str | None = None) -> dict[str, Any]:
    """`web_app` — публичное имя бота, к которому привязано мини-приложение."""
    button: dict[str, Any] = {
        "type": "open_app",
        "text": text[:BUTTON_TEXT_LIMIT],
        "web_app": bot_username,
    }
    if payload:
        button["payload"] = payload[:START_PARAM_LIMIT]
    return button


def my_bookings(bot_username: str) -> dict[str, Any]:
    return inline_keyboard([[open_app_button("Мои записи", bot_username, "my")]])


def book_now(bot_username: str) -> dict[str, Any]:
    return inline_keyboard([[open_app_button("Записаться", bot_username)]])
