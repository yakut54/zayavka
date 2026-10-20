import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import cast

from fastapi import Request

from app.services.captcha import SmartCaptchaVerifier
from app.services.leads import LeadService
from app.settings import Settings

DATA_DIR = Path(__file__).parent / "data"


@lru_cache
def consent_text_sha256() -> bytes:
    """Хеш текста согласия, который показывается человеку (раздел 6.2, `consents`)."""
    return hashlib.sha256((DATA_DIR / "consent_text.ru.md").read_bytes()).digest()


def load_service_slugs(path: Path) -> frozenset[str]:
    """services.json генерируется при сборке сайта (раздел 12.1)."""
    return frozenset(json.loads(path.read_text(encoding="utf-8"))["slugs"])


def get_lead_service(request: Request) -> LeadService:
    state = request.app.state
    settings = cast(Settings, state.settings)
    key = settings.smartcaptcha_server_key
    return LeadService(
        state.sessionmaker,
        settings,
        service_slugs=state.service_slugs,
        consent_text_sha256=consent_text_sha256(),
        captcha=SmartCaptchaVerifier(key.get_secret_value()) if key else None,
    )
