import re
import uuid
from datetime import date
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import AfterValidator, BeforeValidator
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import CsrfAdmin, CurrentAdmin, get_settings_dep
from app.db import get_session
from app.domain.enums import LeadStatus
from app.schemas.admin_leads import (
    EventOut,
    LeadDetail,
    LeadFilters,
    LeadOut,
    LeadPage,
    LeadSort,
    LeadStatusUpdate,
    NoteCreate,
)
from app.schemas.common import reject_unsafe_text
from app.schemas.problem import problem_responses
from app.services.admin_leads import AdminLeadService, export_filename
from app.settings import Settings

ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
MIN_YEAR, MAX_YEAR = 1970, 2200  # за пределами перевод в UTC и в метку времени ломается


def _safe_q(value: str | None) -> str | None:
    return None if value is None else reject_unsafe_text(value)


router = APIRouter(
    prefix="/admin/leads",
    tags=["admin-leads"],
    responses=problem_responses(400, 401, 422),
)

Session = Annotated[AsyncSession, Depends(get_session)]


def get_service(
    request: Request, settings: Annotated[Settings, Depends(get_settings_dep)]
) -> AdminLeadService:
    state = request.app.state
    return AdminLeadService(
        state.sessionmaker, ZoneInfo(settings.business_timezone), state.service_titles
    )


Service = Annotated[AdminLeadService, Depends(get_service)]


def _iso_date_only(value: object) -> object:
    """Только YYYY-MM-DD: pydantic иначе принял бы число как unix-время (`date_to=0`)."""
    if (
        isinstance(value, str)
        and ISO_DATE.fullmatch(value)
        and MIN_YEAR <= int(value[:4]) <= MAX_YEAR
    ):
        return value
    raise ValueError("expected YYYY-MM-DD")


IsoDate = Annotated[date, BeforeValidator(_iso_date_only)]


def get_filters(
    status: LeadStatus | None = None,
    q: Annotated[str | None, Query(max_length=100), AfterValidator(_safe_q)] = None,
    date_from: IsoDate | None = None,
    date_to: IsoDate | None = None,
) -> LeadFilters:
    return LeadFilters(status=status, q=q, date_from=date_from, date_to=date_to)


Filters = Annotated[LeadFilters, Depends(get_filters)]


@router.get("")
async def list_leads(
    _: CurrentAdmin,
    session: Session,
    service: Service,
    filters: Filters,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=10, le=100)] = 25,
    sort: LeadSort = "-created_at",
) -> LeadPage:
    return await service.list(session, filters, sort=sort, page=page, page_size=page_size)


@router.get("/export.csv", response_class=StreamingResponse)
async def export_leads(
    _: CurrentAdmin,
    service: Service,
    filters: Filters,
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> StreamingResponse:
    filename = export_filename(ZoneInfo(settings.business_timezone))
    return StreamingResponse(
        service.export_csv(filters),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.api_route(
    "/export.csv", methods=["POST", "PUT", "PATCH", "DELETE"], include_in_schema=False
)
async def export_leads_wrong_method() -> None:
    """Иначе PATCH /export.csv попал бы в /{lead_id} и вернул 422 вместо 405."""
    raise HTTPException(405, headers={"Allow": "GET"})


@router.get("/{lead_id}", responses=problem_responses(404))
async def get_lead(
    lead_id: uuid.UUID, _: CurrentAdmin, session: Session, service: Service
) -> LeadDetail:
    return await service.detail(session, lead_id)


@router.patch("/{lead_id}", responses=problem_responses(403, 404, 409))
async def update_lead(
    lead_id: uuid.UUID,
    body: LeadStatusUpdate,
    identity: CsrfAdmin,
    session: Session,
    service: Service,
) -> LeadOut:
    return await service.change_status(
        session, identity, lead_id, status=body.status, version=body.version
    )


@router.post("/{lead_id}/notes", status_code=201, responses=problem_responses(403, 404))
async def add_note(
    lead_id: uuid.UUID,
    body: NoteCreate,
    identity: CsrfAdmin,
    session: Session,
    service: Service,
) -> EventOut:
    return await service.add_note(session, identity, lead_id, body.text)
