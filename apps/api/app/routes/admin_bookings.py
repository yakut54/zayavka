import uuid
from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import AfterValidator

from app.auth_deps import CsrfAdmin, CurrentAdmin
from app.booking.admin import BookingAdminService
from app.domain.enums import BookingStatus
from app.routes.max_app import parse_resource
from app.schemas.admin_booking import (
    AdminBookingCreate,
    AdminBookingDetail,
    AdminBookingOut,
    AdminBookingPage,
    AdminBookingStatusUpdate,
    AdminReschedule,
    CalendarOut,
    SlotsAdminOut,
)
from app.schemas.admin_leads import EventOut, NoteCreate
from app.schemas.common import IsoDate, reject_unsafe_text
from app.schemas.problem import problem_responses


def get_admin_service(request: Request) -> BookingAdminService:
    return cast(BookingAdminService, request.app.state.booking_admin)


def _safe_q(value: str | None) -> str | None:
    return None if value is None else reject_unsafe_text(value)


Admin = Annotated[BookingAdminService, Depends(get_admin_service)]

router = APIRouter(
    prefix="/admin/bookings",
    tags=["admin-bookings"],
    responses=problem_responses(400, 401, 422),
)


@router.get("")
async def list_bookings(
    _: CurrentAdmin,
    service: Admin,
    date_from: IsoDate | None = None,
    date_to: IsoDate | None = None,
    resource_id: uuid.UUID | None = None,
    status: BookingStatus | None = None,
    q: Annotated[str | None, Query(max_length=100), AfterValidator(_safe_q)] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=10, le=100)] = 25,
) -> AdminBookingPage:
    return await service.search(
        date_from=date_from,
        date_to=date_to,
        resource_id=resource_id,
        status=status,
        q=q,
        page=page,
        page_size=page_size,
    )


@router.get("/calendar")
async def calendar(_: CurrentAdmin, service: Admin, date: IsoDate | None = None) -> CalendarOut:
    return await service.calendar(date or service.today())


@router.get("/slots")
async def slots(
    _: CurrentAdmin,
    service: Admin,
    service_slug: Annotated[str, Query(alias="service", max_length=64)],
    resource: Annotated[str, Query(max_length=36)],
    date: IsoDate,
    ignore_lead_time: bool = False,
) -> SlotsAdminOut:
    return await service.slots(
        service_slug, parse_resource(resource), date, ignore_lead_time=ignore_lead_time
    )


@router.api_route("/calendar", methods=["PATCH"], include_in_schema=False)
@router.api_route("/slots", methods=["PATCH"], include_in_schema=False)
async def static_paths_wrong_method() -> None:
    """Иначе PATCH /calendar попал бы в /{booking_id} и вернул 422 вместо 405."""
    raise HTTPException(405, headers={"Allow": "GET"})


@router.post("", status_code=201, responses=problem_responses(403, 409))
async def create_booking(
    body: AdminBookingCreate, identity: CsrfAdmin, service: Admin
) -> AdminBookingOut:
    return await service.create(identity, body)


@router.get("/{booking_id}", responses=problem_responses(404))
async def get_booking(booking_id: uuid.UUID, _: CurrentAdmin, service: Admin) -> AdminBookingDetail:
    return await service.detail(booking_id)


@router.patch("/{booking_id}", responses=problem_responses(403, 404, 409))
async def update_booking(
    booking_id: uuid.UUID, body: AdminBookingStatusUpdate, identity: CsrfAdmin, service: Admin
) -> AdminBookingOut:
    return await service.change_status(
        identity,
        booking_id,
        status=body.status,
        cancel_reason=body.cancel_reason,
        version=body.version,
    )


@router.post(
    "/{booking_id}/reschedule", status_code=201, responses=problem_responses(403, 404, 409)
)
async def reschedule_booking(
    booking_id: uuid.UUID, body: AdminReschedule, identity: CsrfAdmin, service: Admin
) -> AdminBookingOut:
    return await service.reschedule(identity, booking_id, body)


@router.post("/{booking_id}/notes", status_code=201, responses=problem_responses(403, 404))
async def add_note(
    booking_id: uuid.UUID, body: NoteCreate, identity: CsrfAdmin, service: Admin
) -> EventOut:
    return await service.add_note(identity, booking_id, body.text)
