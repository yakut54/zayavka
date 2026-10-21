import uuid
from datetime import date, timedelta
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from app.booking.ics import build_ics
from app.booking.service import BookingResult, BookingService, Client, NewBooking
from app.catalog import Business, CatalogService
from app.deps import get_lead_service
from app.domain.enums import BookingStatus, LeadSource
from app.domain.errors import FieldError, MaxInitDataMissing, NotFound, ValidationFailed
from app.max.auth import MaxAuthenticator
from app.max.contact import verify_contact
from app.max.init_data import MaxUser
from app.schemas.leads import LeadCreate
from app.schemas.max_app import (
    BookingCreate,
    BookingPage,
    BookingView,
    Bootstrap,
    BusinessOut,
    CancelRequest,
    DayAvailability,
    DemoSession,
    DemoSessionRequest,
    LegalOut,
    MaxLeadCreated,
    RescheduleRequest,
    ResourceOut,
    ResourceRef,
    ServiceOut,
    ServiceRef,
    SettingsOut,
    SlotOut,
    SlotsOut,
    UserOut,
)
from app.schemas.problem import problem_responses
from app.security.ip import client_ip, hash_ip
from app.services import ratelimit
from app.services.leads import LeadService
from app.settings import Settings

INIT_DATA_HEADER = "X-Max-Init-Data"
DEMO_RATE_LIMIT = "5/600"


def get_booking_service(request: Request) -> BookingService:
    return cast(BookingService, request.app.state.booking_service)


def current_max_user(
    request: Request,
    init_data: Annotated[str | None, Header(alias=INIT_DATA_HEADER)] = None,
) -> MaxUser:
    if not init_data:
        raise MaxInitDataMissing
    authenticator = cast(MaxAuthenticator, request.app.state.max_auth)
    return authenticator.authenticate(init_data)


CurrentUser = Annotated[MaxUser, Depends(current_max_user)]
Bookings = Annotated[BookingService, Depends(get_booking_service)]
IdempotencyKey = Annotated[uuid.UUID, Header(alias="Idempotency-Key")]

router = APIRouter(
    prefix="/max/app", tags=["max-app"], responses=problem_responses(400, 401, 422, 429)
)
protected = problem_responses(400, 401, 403, 404, 409, 422, 429)


def to_view(result: BookingResult, deadline_min: int, service: BookingService) -> BookingView:
    booking, resource = result.booking, result.resource
    deadline = booking.starts_at - timedelta(minutes=deadline_min)
    return BookingView(
        id=booking.id,
        public_number=booking.public_number,
        status=booking.status,
        service=ServiceRef(slug=booking.service_slug, title=booking.service_title_snapshot),
        resource=ResourceRef(id=resource.id, name=resource.name, title=resource.title),
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        can_change=booking.status == BookingStatus.CONFIRMED and service.now() <= deadline,
        change_deadline=deadline,
        version=booking.version,
    )


def parse_resource(value: str) -> uuid.UUID | None:
    if value == "any":
        return None
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ValidationFailed([FieldError("resource", "invalid_format")]) from exc


@router.get("/bootstrap", responses=problem_responses(401))
async def bootstrap(request: Request, user: CurrentUser, bookings: Bookings) -> Bootstrap:
    state = request.app.state
    business = cast(Business, state.business)
    catalog = cast(dict[str, CatalogService], state.catalog)
    policy = await bookings.policy()
    resources = await bookings.active_resources()
    return Bootstrap(
        user=UserOut(first_name=user.first_name),
        business=BusinessOut(
            name=business.name,
            phone=business.phone,
            address=business.address,
            working_hours=business.working_hours,
            timezone=business.timezone,
        ),
        services=[
            ServiceOut(
                slug=item.slug,
                title=item.title,
                price_from=item.price_from,
                duration_min=item.duration_min,
            )
            for item in catalog.values()
            if item.bookable and item.duration_min is not None
        ],
        resources=[
            ResourceOut(id=r.id, name=r.name, title=r.title, service_slugs=slugs)
            for r, slugs in resources
            if slugs
        ],
        settings=SettingsOut(
            cancel_deadline_min=policy.cancel_deadline_min, horizon_days=policy.horizon_days
        ),
        legal=LegalOut(
            policy_version=business.policy_version,
            privacy_url=f"{business.site_url}/privacy",
            consent_url=f"{business.site_url}/consent",
            terms_url=None,
            operator=business.operator,
            support=business.support,
        ),
    )


@router.get("/availability/days", responses=problem_responses(401))
async def availability_days(
    _: CurrentUser,
    bookings: Bookings,
    service: Annotated[str, Query(max_length=64)],
    first: Annotated[date, Query(alias="from")],
    last: Annotated[date, Query(alias="to")],
    resource: Annotated[str, Query(max_length=36)] = "any",
) -> list[DayAvailability]:
    days = await bookings.available_days(service, parse_resource(resource), first, last)
    return [DayAvailability(date=day, available=available) for day, available in days]


@router.get("/availability/slots", responses=problem_responses(401))
async def availability_slots(
    _: CurrentUser,
    bookings: Bookings,
    service: Annotated[str, Query(max_length=64)],
    day: Annotated[date, Query(alias="date")],
    resource: Annotated[str, Query(max_length=36)] = "any",
) -> SlotsOut:
    slots = await bookings.slots(service, parse_resource(resource), day)
    return SlotsOut(
        date=day, slots=[SlotOut(starts_at=s.starts_at, ends_at=s.ends_at) for s in slots]
    )


@router.post("/bookings", status_code=201, responses=protected)
async def create_booking(
    payload: BookingCreate,
    request: Request,
    response: Response,
    user: CurrentUser,
    bookings: Bookings,
    idempotency_key: IdempotencyKey,
) -> BookingView:
    settings = cast(Settings, request.app.state.settings)
    authenticator = cast(MaxAuthenticator, request.app.state.max_auth)
    phone, phone_source = payload.phone, "manual"
    proof = payload.contact_proof
    token = authenticator.bot_token_for(user)
    if (
        proof is not None
        and token is not None
        and verify_contact(proof.phone, proof.authDate, proof.hash, user.id, token)
    ):
        phone, phone_source = f"+{proof.phone.removeprefix('+')}", "max_contact"
    result = await bookings.create(
        NewBooking(
            service_slug=payload.service_slug,
            resource_id=payload.resource_id,
            starts_at=payload.starts_at,
            client=Client(
                name=payload.name,
                phone=phone,
                phone_source=phone_source,
                max_user_id=user.id,
                comment=payload.comment,
            ),
            source="max",
            policy_version=payload.policy_version,
            ip_hash=hash_ip(client_ip(request), settings.secret_key.get_secret_value()),
            user_agent=request.headers.get("user-agent", "")[:512],
            idempotency_key=str(idempotency_key),
        )
    )
    if not result.created:
        response.status_code = 200
    policy = await bookings.policy()
    return to_view(result, policy.cancel_deadline_min, bookings)


@router.get("/bookings", responses=problem_responses(401))
async def list_bookings(
    user: CurrentUser,
    bookings: Bookings,
    scope: Literal["upcoming", "past"] = "upcoming",
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
) -> BookingPage:
    items, total = await bookings.list_for_user(user.id, upcoming=scope == "upcoming", page=page)
    policy = await bookings.policy()
    return BookingPage(
        items=[to_view(item, policy.cancel_deadline_min, bookings) for item in items],
        page=page,
        total=total,
    )


@router.get("/bookings/{booking_id}", responses=protected)
async def get_booking(booking_id: uuid.UUID, user: CurrentUser, bookings: Bookings) -> BookingView:
    result = await bookings.get(booking_id, user.id)
    return to_view(result, (await bookings.policy()).cancel_deadline_min, bookings)


@router.post("/bookings/{booking_id}/cancel", responses=protected)
async def cancel_booking(
    booking_id: uuid.UUID, payload: CancelRequest, user: CurrentUser, bookings: Bookings
) -> BookingView:
    result = await bookings.cancel(booking_id, user.id, payload.version)
    return to_view(result, (await bookings.policy()).cancel_deadline_min, bookings)


@router.post("/bookings/{booking_id}/reschedule", status_code=201, responses=protected)
async def reschedule_booking(
    booking_id: uuid.UUID,
    payload: RescheduleRequest,
    response: Response,
    user: CurrentUser,
    bookings: Bookings,
    idempotency_key: IdempotencyKey,
) -> BookingView:
    result = await bookings.reschedule(
        booking_id,
        user.id,
        starts_at=payload.starts_at,
        resource_id=payload.resource_id,
        version=payload.version,
        idempotency_key=str(idempotency_key),
    )
    if not result.created:
        response.status_code = 200
    return to_view(result, (await bookings.policy()).cancel_deadline_min, bookings)


@router.get(
    "/bookings/{booking_id}/calendar.ics",
    responses={**protected, 200: {"content": {"text/calendar": {}}}},
)
async def booking_calendar(
    booking_id: uuid.UUID, request: Request, user: CurrentUser, bookings: Bookings
) -> Response:
    result = await bookings.get(booking_id, user.id)
    business = cast(Business, request.app.state.business)
    booking = result.booking
    body = build_ics(
        uid=f"{booking.id}@booking",
        title=f"{booking.service_title_snapshot} — {business.name}",
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        created_at=booking.created_at,
        location=business.address,
        description=f"Запись № {booking.public_number}. Телефон: {business.phone}",
    )
    return Response(
        body,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="booking-{booking.public_number}.ics"'
        },
    )


@router.post("/leads", status_code=201, responses=problem_responses(400, 401, 422, 429))
async def create_lead(
    payload: LeadCreate,
    request: Request,
    _: CurrentUser,
    service: Annotated[LeadService, Depends(get_lead_service)],
) -> MaxLeadCreated:
    number = await service.create(
        payload,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        source=LeadSource.MAX,
    )
    return MaxLeadCreated(public_number=number)


@router.post("/demo-session", responses=problem_responses(400, 404, 422, 429))
async def demo_session(payload: DemoSessionRequest, request: Request) -> DemoSession:
    settings = cast(Settings, request.app.state.settings)
    authenticator = cast(MaxAuthenticator, request.app.state.max_auth)
    if not settings.max_demo_bridge:
        raise NotFound
    ip_hash = hash_ip(client_ip(request), settings.secret_key.get_secret_value())
    await ratelimit.enforce(
        request.app.state.sessionmaker, f"demo:{ip_hash.hex()}", DEMO_RATE_LIMIT
    )
    init_data = authenticator.demo_session(payload.first_name)
    if init_data is None:
        raise NotFound
    return DemoSession(init_data=init_data)
