from datetime import date as Date
import os
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_driver
from app.models.booking import Booking
from app.models.trip import Trip, TripStatus
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.models.tour_instance_vehicle import TourInstanceVehicle
from app.models.vehicle import Vehicle
from app.services.websocket_manager import manager

router = APIRouter(tags=["checkin"])


class CheckinRequest(BaseModel):
    booking_id: int | None = None
    qr: str | None = None

    @model_validator(mode="after")
    def require_one_identifier(self) -> "CheckinRequest":
        if self.booking_id is None and (self.qr is None or not str(self.qr).strip()):
            raise ValueError("Provide booking_id or qr")
        return self


def _resolve_booking_id(payload: CheckinRequest) -> int:
    if payload.booking_id is not None:
        return int(payload.booking_id)
    raw = str(payload.qr).strip()
    if raw.upper().startswith("BOOKING:"):
        part = raw.split(":", 1)[1].strip()
        try:
            return int(part)
        except ValueError as e:
            raise HTTPException(status_code=422, detail="Invalid BOOKING:ID in qr") from e
    m = re.match(r"^NCC-BOOKING-(\d+)-", raw, re.IGNORECASE)
    if m:
        return int(m.group(1))
    raise HTTPException(status_code=422, detail="Unrecognized qr format")


@router.post("/checkin")
def checkin(
    payload: CheckinRequest,
    db: Session = Depends(get_db),
    _driver: dict = Depends(require_driver),
) -> dict:
    booking_id = _resolve_booking_id(payload)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    pay_ok = str(getattr(booking, "status", "") or "").lower() in ("confirmed", "paid")
    if not pay_ok:
        raise HTTPException(status_code=400, detail="Pagamento / conferma richiesta prima del check-in")

    if booking.checked_in:
        raise HTTPException(status_code=400, detail="Already checked in")

    if os.getenv("CHECKIN_ENFORCE_TODAY", "0") == "1":
        if booking.date != Date.today():
            raise HTTPException(status_code=400, detail="Check-in allowed only on booking date")

    # Custom rides (non-tour bookings): no instance; trip flow after payment.
    if booking.tour_id is None:
        booking.checked_in = True

        trip = None
        try:
            if getattr(booking, "trip_id", None) is not None:
                trip = db.query(Trip).filter(Trip.id == booking.trip_id).first()
        except Exception:
            trip = None

        if trip is not None:
            try:
                # Optionally update status when driver already assigned.
                st = getattr(trip, "status", None)
                if st == TripStatus.ASSIGNED:
                    trip.status = TripStatus.ARRIVED
            except Exception:
                pass

        db.add(booking)
        db.commit()

        return {
            "status": "checked_in",
            "booking_id": booking.id,
            "type": "custom_ride",
        }

    # Prefer instance-based capacity when present (calendar availability).
    instance = None
    if getattr(booking, "tour_instance_id", None) is not None:
        instance = db.query(TourInstance).filter(TourInstance.id == booking.tour_instance_id).first()
        if instance is not None and instance.status != "in_progress":
            raise HTTPException(status_code=400, detail="Trip not started")

    tour = db.query(Tour).filter(Tour.id == booking.tour_id).first()
    if not tour:
        raise HTTPException(status_code=404, detail="Tour not found")

    occupied_query = db.query(func.coalesce(func.sum(Booking.people), 0)).filter(Booking.checked_in.is_(True))
    if instance is not None:
        occupied_query = occupied_query.filter(Booking.tour_instance_id == instance.id)
    else:
        occupied_query = occupied_query.filter(Booking.tour_id == tour.id)
    occupied = occupied_query.scalar() or 0

    if instance is not None:
        capacity = (
            db.query(func.coalesce(func.sum(Vehicle.seats * TourInstanceVehicle.quantity), 0))
            .join(Vehicle, Vehicle.id == TourInstanceVehicle.vehicle_id)
            .filter(TourInstanceVehicle.tour_instance_id == instance.id)
            .scalar()
            or 0
        )
        capacity = int(capacity) if int(capacity) > 0 else int(tour.capacity)
    else:
        capacity = int(tour.capacity)
    if int(occupied) + int(booking.people) > capacity:
        raise HTTPException(status_code=400, detail="Tour full")

    booking.checked_in = True
    db.add(booking)
    db.commit()

    if instance is not None:
        manager.broadcast_tour_instance_sync(
            instance.id,
            {
                "type": "checkin",
                "booking_id": booking.id,
                "occupied": int(occupied) + int(booking.people),
                "bookings": [
                    {
                        "id": booking.id,
                        "name": booking.customer_name,
                        "passengers": int(booking.people),
                        "status": "checked_in",
                    }
                ],
            },
        )
        manager.broadcast_tour_instance_sync(
            instance.id,
            {
                "type": "capacity_updated",
                "capacity": int(capacity),
                "occupied": int(occupied) + int(booking.people),
            },
        )

    return {
        "message": "Check-in successful",
        "occupied": int(occupied) + int(booking.people),
        "capacity": capacity,
        "name": booking.customer_name,
        "passengers": int(booking.people),
    }

