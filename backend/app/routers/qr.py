from datetime import datetime
import os

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.service_log import ServiceLog
from app.services.email_service import build_service_started_email_body, send_email
from app.services.pdf_service import generate_service_pdf

router = APIRouter(tags=["qr"])


class QRScanRequest(BaseModel):
    qr_code: str


@router.post("/scan-qr")
def scan_qr(payload: QRScanRequest, db: Session = Depends(get_db)) -> dict:
    company_email = os.getenv("COMPANY_EMAIL", "ops@ncc.local")

    with db.begin():
        booking = db.query(Booking).filter(Booking.qr_code == payload.qr_code).first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found for qr_code")
        if booking.status == "started":
            raise HTTPException(status_code=400, detail="Booking was already started")

        start_time = datetime.utcnow()
        booking.status = "started"
        booking.start_time = start_time

        service_log = (
            db.query(ServiceLog).filter(ServiceLog.booking_id == booking.id).first()
        )
        if service_log is None:
            service_log = ServiceLog(
                booking_id=booking.id,
                start_time=start_time,
                status="started",
            )
            db.add(service_log)
        else:
            service_log.start_time = start_time
            service_log.status = "started"

        pdf_path = generate_service_pdf(booking)
        service_log.pdf_url = pdf_path

    send_email(
        to_email=company_email,
        subject=f"Service started for booking #{booking.id}",
        body=build_service_started_email_body(booking=booking, pdf_path=pdf_path),
        attachment_path=pdf_path,
    )

    return {
        "booking_id": booking.id,
        "status": booking.status,
        "start_time": service_log.start_time,
        "pdf_url": service_log.pdf_url,
    }
