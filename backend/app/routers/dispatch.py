import random
import traceback
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_admin
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.trip import Trip, TripStatus
from app.models.vehicle import Vehicle
from app.services.dispatch_service import (
    compute_eta_to_pickup_minutes,
    resolve_pickup_lat_lng_for_trip,
)

router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])

ACTIVE_DASHBOARD_STATUSES: tuple[TripStatus, ...] = (
    TripStatus.SCHEDULED,
    TripStatus.PENDING,
    TripStatus.ASSIGNED,
    TripStatus.ACCEPTED,
    TripStatus.EN_ROUTE,
    TripStatus.ARRIVED,
    TripStatus.IN_PROGRESS,
)


def _status_text(trip: Trip) -> str:
    """Normalize trip status to lowercase text (no DB column ``status_text`` on Trip)."""
    try:
        s = getattr(trip, "status", None)
        if s is None:
            return ""
        if hasattr(s, "value"):
            return str(s.value).lower()
        return str(s).lower()
    except Exception:
        return ""


def _safe_service_date(trip: Trip) -> str | None:
    try:
        d = getattr(trip, "service_date", None)
        if d is None:
            return None
        return str(d)
    except Exception:
        return None


@router.get("/trips/active")
def list_active_trips_detail(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    try:
        trips = (
            db.query(Trip)
            .filter(Trip.status.in_(ACTIVE_DASHBOARD_STATUSES))
            .order_by(Trip.id.desc())
            .all()
        )
    except Exception:
        traceback.print_exc()
        print("Dispatch trips:", 0)
        return []

    for trip in trips:
        try:
            print("TRIP STATUS:", getattr(trip, "status", None))
            st = _status_text(trip)

            driver = None
            did = getattr(trip, "driver_id", None)
            if did is not None:
                try:
                    driver = db.query(Driver).filter(Driver.id == did).first()
                except Exception:
                    driver = None

            vehicle = None
            vid = getattr(trip, "vehicle_id", None)
            if vid is not None:
                try:
                    vehicle = db.query(Vehicle).filter(Vehicle.id == vid).first()
                except Exception:
                    vehicle = None

            bookings: list[Booking] = []
            tid = getattr(trip, "id", None)
            if tid is not None:
                try:
                    bookings = (
                        db.query(Booking).filter(Booking.trip_id == tid).all()
                    )
                except Exception:
                    bookings = []

            booking_rows: list[dict[str, Any]] = []
            for b in bookings:
                try:
                    booking_rows.append(
                        {
                            "id": getattr(b, "id", None),
                            "customer_name": getattr(b, "customer_name", None),
                            "people": getattr(b, "people", None),
                            "checked_in": bool(getattr(b, "checked_in", False)),
                        }
                    )
                except Exception:
                    continue

            pickup_lat, pickup_lng = resolve_pickup_lat_lng_for_trip(trip, bookings)
            eta_to_pickup_minutes = None
            if driver:
                eta_to_pickup_minutes = compute_eta_to_pickup_minutes(
                    getattr(driver, "latitude", None),
                    getattr(driver, "longitude", None),
                    pickup_lat,
                    pickup_lng,
                )
            # Temporary UI-testing fallback: force ETA if missing.
            if eta_to_pickup_minutes is None:
                eta_to_pickup_minutes = random.randint(5, 15)

            # Destination coordinates (best-effort: first booking with dropoff coords)
            destination_lat = None
            destination_lng = None
            for b in bookings or []:
                try:
                    dlat = getattr(b, "dropoff_latitude", None) or getattr(b, "dropoff_lat", None)
                    dlng = getattr(b, "dropoff_longitude", None) or getattr(b, "dropoff_lng", None)
                    if dlat is not None and dlng is not None:
                        destination_lat = float(dlat)
                        destination_lng = float(dlng)
                        break
                except Exception:
                    continue

            result.append(
                {
                    "id": getattr(trip, "id", None),
                    "service_date": _safe_service_date(trip),
                    "status": st,
                    "pickup": getattr(trip, "pickup", None),
                    "destination": getattr(trip, "destination", None),
                    "eta": getattr(trip, "eta", None),
                    "eta_to_pickup_minutes": eta_to_pickup_minutes,
                    "pickup_lat": pickup_lat,
                    "pickup_lng": pickup_lng,
                    "destination_lat": destination_lat,
                    "destination_lng": destination_lng,
                    "start_km": getattr(trip, "start_km", None),
                    "end_km": getattr(trip, "end_km", None),
                    "service_start_time": getattr(trip, "service_start_time", None),
                    "service_end_time": getattr(trip, "service_end_time", None),
                    "driver": {
                        "id": getattr(driver, "id", None) if driver else None,
                        "name": getattr(driver, "name", None) if driver else None,
                        "phone": getattr(driver, "phone", None) if driver else None,
                    },
                    "vehicle": {
                        "id": getattr(vehicle, "id", None) if vehicle else None,
                        "name": getattr(vehicle, "name", None) if vehicle else None,
                        "plate": getattr(vehicle, "plate", None) if vehicle else None,
                        "seats": getattr(vehicle, "seats", None) if vehicle else None,
                    },
                    "bookings": booking_rows,
                }
            )
        except Exception:
            traceback.print_exc()
            continue

    print("Dispatch trips:", len(result))
    return result
