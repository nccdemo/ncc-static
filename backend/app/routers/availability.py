from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.crud.availability import (
    create_availability,
    get_availabilities,
    get_calendar_availability,
)
from app.database import get_db
from app.schemas.availability import (
    AvailabilityCreate,
    AvailabilityResponse,
    CalendarAvailabilityResponse,
)

router = APIRouter(tags=["availability"])


@router.post(
    "/availability", response_model=AvailabilityResponse, status_code=status.HTTP_201_CREATED
)
def create_availability_endpoint(
    payload: AvailabilityCreate, db: Session = Depends(get_db)
) -> AvailabilityResponse:
    return create_availability(db, payload)


@router.get("/availability", response_model=list[AvailabilityResponse])
def list_availability_endpoint(
    db: Session = Depends(get_db),
) -> list[AvailabilityResponse]:
    return get_availabilities(db)


@router.get("/calendar", response_model=list[CalendarAvailabilityResponse])
def get_calendar_endpoint(
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
) -> list[CalendarAvailabilityResponse]:
    return get_calendar_availability(db=db, start_date=start_date, end_date=end_date)
