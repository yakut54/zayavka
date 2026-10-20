from email.message import EmailMessage
from pathlib import Path

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.notifications.base import LeadView
from app.settings import Settings

TEMPLATES = Path(__file__).parent.parent / "templates"
SMTPS_PORT = 465
SUBMISSION_PORT = 587

_env = Environment(
    loader=FileSystemLoader(TEMPLATES),
    autoescape=select_autoescape(["html.j2"]),
    undefined=StrictUndefined,
)


class EmailChannel:
    name = "email"

    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def build_message(self, lead: LeadView) -> EmailMessage:
        context = {
            "lead": lead,
            "admin_url": f"{self._s.admin_origin.rstrip('/')}/leads/{lead.id}",
        }
        message = EmailMessage()
        message["Subject"] = f"Новая заявка № {lead.public_number}"
        message["From"] = self._s.smtp_from or "noreply@localhost"
        message["To"] = ", ".join(self._s.notify_emails)
        message.set_content(_env.get_template("lead_created.txt.j2").render(context))
        message.add_alternative(
            _env.get_template("lead_created.html.j2").render(context), subtype="html"
        )
        return message

    async def send_lead_created(self, lead: LeadView) -> None:
        s = self._s
        password = s.smtp_password.get_secret_value() if s.smtp_password else None
        await aiosmtplib.send(
            self.build_message(lead),
            hostname=s.smtp_host,
            port=s.smtp_port,
            username=s.smtp_user,
            password=password,
            use_tls=s.smtp_port == SMTPS_PORT,
            start_tls=True if s.smtp_port == SUBMISSION_PORT else None,
            timeout=15,
        )
