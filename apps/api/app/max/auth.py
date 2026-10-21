"""Аутентификация мини-приложения: настоящий токен, затем (в демо) демо-токен."""

import hashlib
import json
import secrets
import time
from datetime import UTC, datetime, timedelta

from app.domain.errors import MaxInitDataInvalid
from app.max import init_data
from app.max.init_data import MaxUser
from app.settings import Settings

CACHE_TTL_S = 60
CACHE_MAX_ENTRIES = 1024


class MaxAuthenticator:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._cache: dict[str, tuple[float, MaxUser]] = {}

    @property
    def _ttl(self) -> timedelta:
        return timedelta(hours=self._settings.max_init_data_ttl_hours)

    def bot_token_for(self, user: MaxUser) -> str | None:
        """Токен, которым подписаны данные пользователя (для проверки телефона)."""
        secret = self._settings.max_demo_bot_token if user.is_demo else self._settings.max_bot_token
        return secret.get_secret_value() if secret else None

    def authenticate(self, raw: str) -> MaxUser:
        key = hashlib.sha256(raw.encode()).hexdigest()
        cached = self._cache.get(key)
        if cached is not None and cached[0] > time.monotonic():
            return cached[1]
        user = self._verify(raw)
        if len(self._cache) >= CACHE_MAX_ENTRIES:
            self._cache.clear()
        self._cache[key] = (time.monotonic() + CACHE_TTL_S, user)
        return user

    def _verify(self, raw: str) -> MaxUser:
        now = datetime.now(UTC)
        settings = self._settings
        failure: Exception = MaxInitDataInvalid()
        if settings.max_bot_token is not None:
            try:
                return init_data.verify(
                    raw, settings.max_bot_token.get_secret_value(), now=now, ttl=self._ttl
                )
            except MaxInitDataInvalid as exc:
                failure = exc
        if settings.max_demo_bridge and settings.max_demo_bot_token is not None:
            user = init_data.verify(
                raw, settings.max_demo_bot_token.get_secret_value(), now=now, ttl=self._ttl
            )
            return MaxUser(id=user.id, first_name=user.first_name, is_demo=True)
        raise failure

    def demo_session(self, first_name: str) -> str | None:
        """`initData`, подписанный демо-токеном (id < 0); None, если демо выключено."""
        token = self._settings.max_demo_bot_token
        if not self._settings.max_demo_bridge or token is None:
            return None
        user = {"id": -(secrets.randbelow(2**31) + 1), "first_name": first_name}
        fields = {
            "auth_date": str(int(time.time())),
            "user": json.dumps(user, ensure_ascii=False, separators=(",", ":")),
        }
        return init_data.sign(fields, token.get_secret_value())
