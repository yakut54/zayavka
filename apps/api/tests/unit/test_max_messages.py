import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.catalog import Business
from app.domain.enums import BookingStatus
from app.max.render import MessageRenderer, clip
from app.notifications.booking import BookingMessage

NSK = ZoneInfo("Asia/Novosibirsk")
START = datetime(2030, 1, 7, 10, 0, tzinfo=NSK).astimezone(UTC)  # понедельник

BUSINESS = Business(
    name="Гараж 24",
    phone="+70000000000",
    address="г. Новосибирск, ул. Примерная, 1",
    working_hours="Пн–Сб",
    timezone="Asia/Novosibirsk",
    site_url="https://example.ru",
    policy_version="2026-10-20",
    support="Поддержка",
    operator="Оператор",
    bot_username="example_bot",
)

MESSAGE = BookingMessage(
    id=uuid.UUID(int=1),
    public_number=17,
    status=BookingStatus.CONFIRMED,
    service_title="Шиномонтаж",
    starts_at=START,
    ends_at=START + timedelta(minutes=45),
    resource_name="Анна",
    client_name="Иван Петров",
    client_phone="+79991234567",
    comment=None,
    max_user_id=4242,
    cancel_reason=None,
    rescheduled=False,
    can_change=True,
    change_until=START - timedelta(hours=2),
    business_name=BUSINESS.name,
    business_phone=BUSINESS.phone,
    business_address=BUSINESS.address,
    admin_url="https://admin.example.ru/bookings/00000000-0000-0000-0000-000000000001",
)

renderer = MessageRenderer(NSK)


def render(kind: str, message: BookingMessage = MESSAGE) -> str:
    return renderer.render(kind, b=message)


def test_confirmed_snapshot() -> None:
    assert render("booking_confirmed_client") == (
        "Вы записаны ✅\n"
        "Шиномонтаж, 7 января (понедельник), 10:00–10:45\n"
        "Специалист: Анна\n"
        "Адрес: г. Новосибирск, ул. Примерная, 1\n"
        "Отменить или перенести можно до 08:00 7 января — кнопка «Мои записи»."
    )


def test_confirmed_after_deadline_points_to_phone() -> None:
    text = render("booking_confirmed_client", replace(MESSAGE, can_change=False))
    assert text.endswith("Отменить или перенести запись можно по телефону +70000000000.")
    assert "кнопка" not in text


def test_reminders_snapshot() -> None:
    assert render("booking_reminder_24h") == (
        "Напоминаем: завтра в 10:00 — Шиномонтаж.\n"
        "Адрес: г. Новосибирск, ул. Примерная, 1\n"
        "Если планы изменились, перенесите или отмените запись — кнопка «Мои записи»."
    )
    assert render("booking_reminder_2h") == (
        "Напоминаем: сегодня в 10:00 — Шиномонтаж.\n"
        "Адрес: г. Новосибирск, ул. Примерная, 1\n"
        "Если не получается приехать, позвоните: +70000000000."
    )


def test_cancelled_and_rescheduled_snapshots() -> None:
    cancelled = replace(MESSAGE, cancel_reason="Изменение графика")
    assert render("booking_cancelled_client", cancelled) == (
        "Запись отменена ❌\n"
        "Шиномонтаж, 7 января (понедельник), 10:00\n"
        "Причина: Изменение графика\n"
        "Записаться снова можно в любой момент — кнопка «Мои записи». "
        "Вопросы — по телефону +70000000000."
    )
    assert "Причина" not in render("booking_cancelled_client")
    assert render("booking_rescheduled_client") == (
        "Запись перенесена 🔁\n"
        "Шиномонтаж, теперь 7 января (понедельник), 10:00–10:45\n"
        "Специалист: Анна\n"
        "Адрес: г. Новосибирск, ул. Примерная, 1"
    )


def test_owner_snapshots() -> None:
    assert render("booking_created_owner") == (
        "Новая запись № 17\n"
        "Шиномонтаж — 7 января (понедельник), 10:00–10:45\n"
        "Специалист: Анна\n"
        "Клиент: Иван Петров, +79991234567\n"
        "https://admin.example.ru/bookings/00000000-0000-0000-0000-000000000001"
    )
    assert render("booking_cancelled_owner") == (
        "Отмена записи № 17\n"
        "Шиномонтаж — 7 января (понедельник), 10:00\n"
        "Специалист: Анна\n"
        "Клиент: Иван Петров, +79991234567\n"
        "https://admin.example.ru/bookings/00000000-0000-0000-0000-000000000001"
    )
    moved = render("booking_created_owner", replace(MESSAGE, rescheduled=True, comment="Побыстрее"))
    assert moved.startswith("Запись № 17 (перенос)\n") and "Комментарий: Побыстрее" in moved


def test_welcome_variants() -> None:
    welcome = renderer.render("bot_welcome", business=BUSINESS, variant="welcome")
    assert welcome == (
        "Здравствуйте! Это запись онлайн: «Гараж 24». "
        "Нажмите кнопку ниже, чтобы выбрать услугу и удобное время."
    )
    fallback = renderer.render("bot_welcome", business=BUSINESS, variant="fallback")
    assert fallback == "Я умею только записывать — нажмите кнопку ниже."


def test_time_is_shown_in_business_zone_even_across_utc_midnight() -> None:
    late = datetime(2030, 1, 7, 23, 30, tzinfo=NSK).astimezone(
        UTC
    )  # в UTC уже 8 января? нет: 16:30
    early = datetime(2030, 1, 8, 1, 0, tzinfo=NSK).astimezone(UTC)  # в UTC — 7 января 18:00
    text = render("booking_cancelled_client", replace(MESSAGE, starts_at=early))
    assert "8 января (вторник), 01:00" in text
    assert "7 января" in render("booking_cancelled_client", replace(MESSAGE, starts_at=late))


def test_client_data_is_not_interpreted_as_markup() -> None:
    nasty = "<b>*жирный*</b> [ссылка](http://x) {{ 7*7 }} {% if %} &amp; _x_"
    text = render("booking_created_owner", replace(MESSAGE, client_name=nasty, comment=nasty))
    assert text.count(nasty) == 2  # имя и комментарий выведены как есть
    assert "49" not in text


def test_long_comment_is_clipped_and_message_fits_limit() -> None:
    text = render("booking_created_owner", replace(MESSAGE, comment="я" * 5000))
    comment_line = next(line for line in text.splitlines() if line.startswith("Комментарий"))
    assert len(comment_line) <= len("Комментарий: ") + 300 and comment_line.endswith("…")
    huge = replace(MESSAGE, client_name="ж" * 6000)
    assert len(render("booking_created_owner", huge)) <= 4000


@pytest.mark.parametrize(
    ("value", "limit", "expected"),
    [("abc", 3, "abc"), ("abcd", 3, "ab…"), ("ab cd", 4, "ab…"), ("", 5, "")],
)
def test_clip(value: str, limit: int, expected: str) -> None:
    assert clip(value, limit) == expected


def test_every_kind_has_a_template() -> None:
    from app.notifications.booking import CLIENT_KINDS, OWNER_KINDS

    for kind in CLIENT_KINDS | OWNER_KINDS:
        assert render(kind)
