import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import LeadEventType, LeadSource
from app.models import Consent, Lead, LeadEvent, NotificationOutbox


async def add_consent(
    session: AsyncSession,
    *,
    policy_version: str,
    consent_text_sha256: bytes,
    ip_hash: bytes,
    user_agent: str,
) -> Consent:
    consent = Consent(
        policy_version=policy_version,
        consent_text_sha256=consent_text_sha256,
        ip_hash=ip_hash,
        user_agent=user_agent,
    )
    session.add(consent)
    await session.flush()
    return consent


async def add_lead(
    session: AsyncSession,
    *,
    name: str,
    phone_e164: str,
    email: str | None,
    message: str | None,
    service_slug: str | None,
    utm: dict[str, str],
    consent_id: uuid.UUID,
    source: LeadSource = LeadSource.SITE,
) -> Lead:
    lead = Lead(
        name=name,
        phone_e164=phone_e164,
        email=email,
        message=message,
        service_slug=service_slug,
        utm=utm,
        consent_id=consent_id,
        source=source.value,
    )
    session.add(lead)
    await session.flush()
    await session.refresh(lead)
    return lead


async def add_event(
    session: AsyncSession,
    *,
    lead_id: uuid.UUID,
    type_: LeadEventType,
    payload: dict[str, Any],
    actor_user_id: uuid.UUID | None = None,
) -> LeadEvent:
    event = LeadEvent(
        lead_id=lead_id, type=type_.value, payload=payload, actor_user_id=actor_user_id
    )
    session.add(event)
    await session.flush()
    return event


async def add_outbox(
    session: AsyncSession, *, kind: str, channel: str, payload: dict[str, Any]
) -> NotificationOutbox:
    row = NotificationOutbox(kind=kind, channel=channel, payload=payload)
    session.add(row)
    await session.flush()
    return row
