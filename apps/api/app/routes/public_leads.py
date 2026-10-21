from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.deps import get_lead_service
from app.schemas.leads import LeadCreate, LeadCreated
from app.schemas.problem import problem_responses
from app.security.ip import client_ip
from app.services.leads import LeadService

router = APIRouter(prefix="/public", tags=["public"], responses=problem_responses(400, 422, 429))


@router.post("/leads", status_code=201)
async def create_lead(
    payload: LeadCreate,
    request: Request,
    service: Annotated[LeadService, Depends(get_lead_service)],
) -> LeadCreated:
    number = await service.create(
        payload,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )
    return LeadCreated(public_number=number)
