from datetime import datetime

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.services.pdf_service import generate_service_pdf

router = APIRouter(prefix="/service-log", tags=["service-log"])


class ServiceLogRequest(BaseModel):
    booking_id: int
    start_time: datetime | None = None
    end_time: datetime | None = None


@router.post("/close")
def close_service(payload: ServiceLogRequest, db: Session = Depends(get_db)) -> dict:
    booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    return {
        "booking_id": payload.booking_id,
        "pdf_url": generate_service_pdf(booking),
        "status": "completed",
    }
