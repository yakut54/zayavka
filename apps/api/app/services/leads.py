import secrets
from collections.abc import Collection

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.enums import LeadEventType, LeadSource
from app.domain.errors import FieldError, ValidationFailed
from app.logging import get_logger
from app.repositories import leads as repo
from app.schemas.leads import LeadCreate
from app.security.ip import hash_ip
from app.services import ratelimit
from app.services.captcha import CaptchaVerifier
from app.services.phone import normalize_phone
from app.settings import Settings

MIN_FILL_MS = 3000
USER_AGENT_MAX = 512


class LeadService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings: Settings,
        *,
        service_slugs: Collection[str],
        consent_text_sha256: bytes,
        captcha: CaptchaVerifier | None = None,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._settings = settings
        self._slugs = service_slugs
        self._consent_sha = consent_text_sha256
        self._captcha = captcha

    async def create(
        self,
        data: LeadCreate,
        *,
        ip: str,
        user_agent: str,
        source: LeadSource = LeadSource.SITE,
    ) -> int:
        ip_hash = hash_ip(ip, self._settings.secret_key.get_secret_value())
        await ratelimit.enforce(
            self._sessionmaker, f"leads:{ip_hash.hex()}", self._settings.rate_limit_leads
        )

        if data.website or data.elapsed_ms < MIN_FILL_MS:
            get_logger().info("spam_suspected", reason="honeypot" if data.website else "too_fast")
            return 1000 + secrets.randbelow(9000)

        if self._captcha is not None and not await self._verify_captcha(self._captcha, data, ip):
            raise ValidationFailed([FieldError("captcha_token", "invalid_format")])

        if data.policy_version != self._settings.privacy_policy_version:
            raise ValidationFailed([FieldError("consent", "consent_required")])

        errors: list[FieldError] = []
        phone = normalize_phone(data.phone)
        if phone is None:
            errors.append(FieldError("phone", "phone_invalid"))
        if data.service_slug is not None and data.service_slug not in self._slugs:
            errors.append(FieldError("service_slug", "unknown_service"))
        if errors or phone is None:
            raise ValidationFailed(errors)

        async with self._sessionmaker() as session, session.begin():
            return await self._store(session, data, phone, ip_hash, user_agent, source)

    async def _verify_captcha(self, captcha: CaptchaVerifier, data: LeadCreate, ip: str) -> bool:
        if not data.captcha_token:
            return False
        return await captcha.verify(data.captcha_token, ip)

    async def _store(
        self,
        session: AsyncSession,
        data: LeadCreate,
        phone: str,
        ip_hash: bytes,
        user_agent: str,
        source: LeadSource,
    ) -> int:
        consent = await repo.add_consent(
            session,
            policy_version=data.policy_version,
            consent_text_sha256=self._consent_sha,
            ip_hash=ip_hash,
            user_agent=user_agent[:USER_AGENT_MAX],
        )
        lead = await repo.add_lead(
            session,
            name=data.name,
            phone_e164=phone,
            email=data.email,
            message=data.message or None,
            service_slug=data.service_slug,
            utm={str(k): v for k, v in data.utm.items()},
            consent_id=consent.id,
            source=source,
        )
        await repo.add_event(session, lead_id=lead.id, type_=LeadEventType.CREATED, payload={})
        for channel in self._settings.enabled_channels:
            await repo.add_outbox(
                session,
                kind="lead_created",
                channel=channel,
                payload={"lead_id": str(lead.id)},
            )
        return lead.public_number
