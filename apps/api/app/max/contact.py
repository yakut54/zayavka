"""Проверка телефона из `WebApp.requestContact()` (dev.max.ru/docs/webapps/bridge).

Документация: `HMAC_SHA256(authDate + phone + userId, botToken)`; сообщение — пары
`key=value` по алфавиту через перевод строки; телефон без `+`; ключ — токен бота.
Формат результата в документации не указан (принят hex, как у initData), примеров нет:
если подпись не сошлась, телефон считается введённым вручную (docs/QUESTIONS.md).
"""

import hashlib
import hmac


def contact_message(phone: str, auth_date: str, user_id: int) -> str:
    return f"authDate={auth_date}\nphone={phone.removeprefix('+')}\nuserId={user_id}"


def sign_contact(phone: str, auth_date: str, user_id: int, bot_token: str) -> str:
    message = contact_message(phone, auth_date, user_id)
    return hmac.new(bot_token.encode(), message.encode(), hashlib.sha256).hexdigest()


def verify_contact(
    phone: str, auth_date: str, signature: str, user_id: int, bot_token: str
) -> bool:
    expected = sign_contact(phone, auth_date, user_id, bot_token)
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
