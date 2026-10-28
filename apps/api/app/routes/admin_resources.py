import uuid

from fastapi import APIRouter, Response

from app.auth_deps import CsrfAdmin, CurrentAdmin
from app.routes.admin_bookings import Admin
from app.schemas.admin_booking import (
    BookingSettingsOut,
    BookingSettingsPatch,
    ExceptionCreate,
    ExceptionOut,
    ResourceAdminOut,
    ResourceCreate,
    ResourcePatch,
    ResourceServices,
    WorkingHoursBody,
    WorkingHoursOut,
)
from app.schemas.common import IsoDate
from app.schemas.problem import problem_responses

router = APIRouter(
    prefix="/admin", tags=["admin-resources"], responses=problem_responses(400, 401, 422)
)
changes = problem_responses(403, 404, 409)


@router.get("/resources")
async def list_resources(_: CurrentAdmin, service: Admin) -> list[ResourceAdminOut]:
    return await service.list_resources()


@router.post("/resources", status_code=201, responses=problem_responses(403))
async def create_resource(body: ResourceCreate, _: CsrfAdmin, service: Admin) -> ResourceAdminOut:
    return await service.create_resource(body)


@router.patch("/resources/{resource_id}", responses=changes)
async def patch_resource(
    resource_id: uuid.UUID, body: ResourcePatch, _: CsrfAdmin, service: Admin
) -> ResourceAdminOut:
    return await service.patch_resource(resource_id, body)


@router.delete("/resources/{resource_id}", status_code=204, responses=changes)
async def delete_resource(resource_id: uuid.UUID, _: CsrfAdmin, service: Admin) -> Response:
    await service.delete_resource(resource_id)
    return Response(status_code=204)


@router.put("/resources/{resource_id}/services", responses=changes)
async def put_services(
    resource_id: uuid.UUID, body: ResourceServices, _: CsrfAdmin, service: Admin
) -> ResourceAdminOut:
    return await service.set_services(resource_id, body.service_slugs)


@router.get("/resources/{resource_id}/working-hours", responses=problem_responses(404))
async def get_working_hours(
    resource_id: uuid.UUID, _: CurrentAdmin, service: Admin
) -> WorkingHoursOut:
    return await service.get_working_hours(resource_id)


@router.put("/resources/{resource_id}/working-hours", responses=changes)
async def put_working_hours(
    resource_id: uuid.UUID,
    body: WorkingHoursBody,
    _: CsrfAdmin,
    service: Admin,
    force: bool = False,
    cancel_conflicting: bool = False,
) -> WorkingHoursOut:
    return await service.put_working_hours(
        resource_id, body.days, force=force, cancel_conflicting=cancel_conflicting
    )


@router.get("/resources/{resource_id}/exceptions", responses=problem_responses(404))
async def list_exceptions(
    resource_id: uuid.UUID,
    _: CurrentAdmin,
    service: Admin,
    date_from: IsoDate | None = None,
    date_to: IsoDate | None = None,
) -> list[ExceptionOut]:
    return await service.list_exceptions(resource_id, date_from, date_to)


@router.post("/resources/{resource_id}/exceptions", status_code=201, responses=changes)
async def put_exception(
    resource_id: uuid.UUID,
    body: ExceptionCreate,
    _: CsrfAdmin,
    service: Admin,
    force: bool = False,
    cancel_conflicting: bool = False,
) -> ExceptionOut:
    return await service.put_exception(
        resource_id, body, force=force, cancel_conflicting=cancel_conflicting
    )


@router.delete(
    "/resources/{resource_id}/exceptions/{exception_id}", status_code=204, responses=changes
)
async def delete_exception(
    resource_id: uuid.UUID,
    exception_id: uuid.UUID,
    _: CsrfAdmin,
    service: Admin,
    force: bool = False,
    cancel_conflicting: bool = False,
) -> Response:
    await service.delete_exception(
        resource_id, exception_id, force=force, cancel_conflicting=cancel_conflicting
    )
    return Response(status_code=204)


@router.get("/booking-settings")
async def get_booking_settings(_: CurrentAdmin, service: Admin) -> BookingSettingsOut:
    return await service.get_settings()


@router.patch("/booking-settings", responses=problem_responses(403, 409))
async def patch_booking_settings(
    body: BookingSettingsPatch, _: CsrfAdmin, service: Admin
) -> BookingSettingsOut:
    return await service.patch_settings(body)
