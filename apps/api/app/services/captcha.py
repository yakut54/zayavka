from typing import Protocol

import httpx

from app.logging import get_logger

VALIDATE_URL = "https://smartcaptcha.cloud.yandex.ru/validate"


class CaptchaVerifier(Protocol):
    async def verify(self, token: str, ip: str) -> bool: ...


class SmartCaptchaVerifier:
    """Yandex SmartCaptcha. При недоступности сервиса пропускаем (рекомендация Яндекса)."""

    def __init__(self, server_key: str, client: httpx.AsyncClient | None = None) -> None:
        self._key = server_key
        self._client = client

    async def verify(self, token: str, ip: str) -> bool:
        try:
            if self._client is not None:
                response = await self._client.post(VALIDATE_URL, data=self._form(token, ip))
            else:
                async with httpx.AsyncClient(timeout=5) as client:
                    response = await client.post(VALIDATE_URL, data=self._form(token, ip))
            if response.status_code != 200:
                get_logger().warning("captcha_unavailable", status=response.status_code)
                return True
            return bool(response.json().get("status") == "ok")
        except httpx.HTTPError, ValueError:
            get_logger().warning("captcha_unavailable")
            return True

    def _form(self, token: str, ip: str) -> dict[str, str]:
        return {"secret": self._key, "token": token, "ip": ip}
