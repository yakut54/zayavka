import httpx

from app.notifications.base import LeadView

# Документация: https://dev.max.ru/docs-api/methods/POST/messages
# Токен передаётся «как есть» в заголовке Authorization; лимит — 2 сообщения/с на чат.
MAX_API_URL = "https://platform-api2.max.ru/messages"


class MaxChannel:
    name = "max"

    def __init__(
        self,
        bot_token: str,
        chat_id: str,
        admin_origin: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._token = bot_token
        self._chat_id = chat_id
        self._admin_origin = admin_origin.rstrip("/")
        self._client = client

    def build_text(self, lead: LeadView) -> str:
        lines = [f"Новая заявка № {lead.public_number}", f"{lead.name}, {lead.phone_e164}"]
        if service := lead.service_title or lead.service_slug:
            lines.append(f"Услуга: {service}")
        if lead.message:
            lines.append(lead.message)
        lines.append(f"{self._admin_origin}/leads/{lead.id}")
        return "\n".join(lines)[:4000]

    async def send_lead_created(self, lead: LeadView) -> None:
        if self._client is not None:
            await self._post(self._client, lead)
        else:
            async with httpx.AsyncClient(timeout=10) as client:
                await self._post(client, lead)

    async def _post(self, client: httpx.AsyncClient, lead: LeadView) -> None:
        response = await client.post(
            MAX_API_URL,
            params={"chat_id": self._chat_id},
            headers={"Authorization": self._token},
            json={"text": self.build_text(lead)},
        )
        response.raise_for_status()
