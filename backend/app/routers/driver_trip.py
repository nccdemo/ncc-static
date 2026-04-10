from datetime import date as Date
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_driver, require_trip_driver_or_admin
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.tour_instance import TourInstance
from app.models.trip import Trip, TripStatus
from app.models.vehicle import Vehicle
from app.services.trip_service import TripService
from app.services.ride_commission import effective_commission_rate, split_for_booking_and_trip
from app.services.email_service import send_email
from app.services.geocoding import geocode_address
from app.services.service_sheet import build_service_sheet_data, generate_service_sheet_pdf_bytes
from app.services.websocket_manager import manager

router = APIRouter(prefix="/driver", tags=["driver"])


class StartTripBody(BaseModel):
    start_km: int


class CompleteTripBody(BaseModel):
    end_km: int


class UpdateServiceBody(BaseModel):
    driver_id: int
    start_km: float | None = None
    end_km: float | None = None
    service_start_time: datetime | None = None
    service_end_time: datetime | None = None


class VehicleSummary(BaseModel):
    plate_number: str | None = None
    model: str | None = None
    type: str | None = Field(default=None, description="Vehicle category / body type")


class DriverTripOut(BaseModel):
    trip_id: int
    driver_id: int
    status: str
    mobile_status: str | None = Field(
        default=None,
        description="Simplified state: confirmed | in_progress | completed | cancelled",
    )
    customer_name: str | None = None
    customer_phone: str | None = None
    seats: int | None = Field(default=None, description="Passenger count (trip or booking)")
    pickup: str | None = None
    destination: str | None = None
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    start_km: float | None = None
    end_km: float | None = None
    service_start_time: datetime | None = None
    service_end_time: datetime | None = None
    trip_price: float | None = None
    driver_earnings: float | None = None
    platform_fee: float | None = None
    commission_rate: float | None = None
    vehicle: VehicleSummary | None = None


class DriverTodayBookingItem(BaseModel):
    """Confirmed bookings for the driver on the current calendar day."""

    customer_name: str
    phone: str
    seats: int
    time: str
    status: str
    booking_id: int
    trip_id: int | None = None


class DriverTodayTripItem(BaseModel):
    """Compact trip row for mobile list screens."""

    id: int
    mobile_status: str
    customer_name: str | None = None
    customer_phone: str | None = None
    seats: int
    pickup: str | None = None
    service_date: str | None = None
    status: str


class DriverTripStatusBody(BaseModel):
    status: Literal["confirmed", "in_progress", "completed"]


class DriverTripStatusResponse(BaseModel):
    success: bool
    trip_id: int
    status: str


def _driver_id_from_auth(auth: dict) -> int:
    return int(auth["sub"])


def _trip_status_to_mobile(st: TripStatus | str | None) -> str:
    raw = st.value if hasattr(st, "value") else str(st or "")
    u = raw.upper()
    if u == "COMPLETED":
        return "completed"
    if u in ("IN_PROGRESS", "EN_ROUTE", "ARRIVED"):
        return "in_progress"
    if u == "CANCELLED":
        return "cancelled"
    return "confirmed"


def _primary_booking(db: Session, trip: Trip) -> Booking | None:
    b = getattr(trip, "booking", None)
    if b is not None:
        return b
    return (
        db.query(Booking)
        .filter(Booking.trip_id == int(trip.id))
        .order_by(Booking.id.asc())
        .first()
    )


def _trip_to_today_item(db: Session, trip: Trip) -> DriverTodayTripItem:
    booking = _primary_booking(db, trip)
    seats = int(getattr(trip, "passengers", 0) or 0)
    if booking is not None and seats <= 0:
        seats = int(getattr(booking, "people", 1) or 1)
    if seats <= 0:
        seats = 1
    svc = getattr(trip, "service_date", None)
    return DriverTodayTripItem(
        id=int(trip.id),
        mobile_status=_trip_status_to_mobile(trip.status),
        customer_name=(getattr(booking, "customer_name", None) if booking else None),
        customer_phone=(getattr(booking, "phone", None) if booking else None),
        seats=seats,
        pickup=getattr(trip, "pickup", None) or (getattr(booking, "pickup", None) if booking else None),
        service_date=svc.isoformat() if svc is not None and hasattr(svc, "isoformat") else None,
        status=(trip.status.value if hasattr(trip.status, "value") else str(trip.status)),
    )


def _booking_time_iso(t) -> str:
    if t is None:
        return ""
    if hasattr(t, "isoformat"):
        return t.isoformat()
    return str(t)


def _display_time_for_driver_booking(b: Booking) -> str:
    """Prefer tour instance start time when booking.time is a placeholder midnight."""
    inst = getattr(b, "tour_instance", None)
    if inst is not None:
        st = getattr(inst, "start_time", None)
        if st is not None:
            return _booking_time_iso(st)
    return _booking_time_iso(getattr(b, "time", None))


@router.get("/today-trips", response_model=list[DriverTodayBookingItem])
def list_today_trips(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> list[DriverTodayBookingItem]:
    """Confirmed bookings for today (server local date) for this driver.

    Includes rows where ``bookings.driver_id`` matches, or the linked ``trips.driver_id``
    matches (transfer / trip-backed bookings).
    """
    did = _driver_id_from_auth(auth)
    today = Date.today()
    instance_for_driver = exists().where(
        TourInstance.id == Booking.tour_instance_id,
        TourInstance.driver_id == did,
    )
    rows = (
        db.query(Booking)
        .options(joinedload(Booking.tour_instance))
        .outerjoin(Trip, Booking.trip_id == Trip.id)
        .filter(
            Booking.date == today,
            func.lower(func.trim(Booking.status)) == "confirmed",
            or_(
                Booking.driver_id == did,
                Trip.driver_id == did,
                instance_for_driver,
            ),
        )
        .order_by(Booking.time.asc(), Booking.id.asc())
        .all()
    )
    out: list[DriverTodayBookingItem] = []
    for b in rows:
        seats = int(getattr(b, "people", 0) or 0)
        if seats <= 0:
            seats = 1
        tid = getattr(b, "trip_id", None)
        out.append(
            DriverTodayBookingItem(
                customer_name=(getattr(b, "customer_name", None) or "").strip() or "—",
                phone=(getattr(b, "phone", None) or "").strip() or "—",
                seats=seats,
                time=_display_time_for_driver_booking(b),
                status=(getattr(b, "status", None) or "confirmed"),
                booking_id=int(b.id),
                trip_id=int(tid) if tid is not None else None,
            )
        )
    return out


@router.get("/trips-history", response_model=list[DriverTodayTripItem])
def list_trips_history(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
    limit: int = Query(100, ge=1, le=200),
) -> list[DriverTodayTripItem]:
    """Past or completed / cancelled trips for this driver."""
    did = _driver_id_from_auth(auth)
    today = Date.today()

    rows = (
        db.query(Trip)
        .options(joinedload(Trip.booking))
        .filter(
            Trip.driver_id == did,
            or_(
                Trip.service_date.is_(None),
                Trip.service_date < today,
                Trip.status == TripStatus.COMPLETED,
                Trip.status == TripStatus.CANCELLED,
            ),
        )
        .order_by(Trip.id.desc())
        .limit(limit)
        .all()
    )
    return [_trip_to_today_item(db, t) for t in rows]


@router.post("/trips/{trip_id}/status", response_model=DriverTripStatusResponse)
def update_trip_status_mobile(
    trip_id: int,
    payload: DriverTripStatusBody,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> DriverTripStatusResponse:
    """
    Mobile status progression: **confirmed** → **in_progress** → **completed**
    (mapped to TripStatus ACCEPTED / IN_PROGRESS / COMPLETED).
    """
    did = _driver_id_from_auth(auth)
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    TripService.sync_trip_driver_from_bookings(db, trip)
    db.flush()
    db.refresh(trip)

    if getattr(trip, "driver_id", None) is None or int(trip.driver_id) != did:
        raise HTTPException(status_code=403, detail="Not assigned to this trip")

    target = payload.status
    cur = trip.status

    if target == "confirmed":
        if cur in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise HTTPException(status_code=400, detail="Trip already finished")
        if cur == TripStatus.ASSIGNED:
            TripService.accept_trip(db, trip)
        elif cur in (TripStatus.SCHEDULED, TripStatus.PENDING) and trip.driver_id is not None:
            trip.status = TripStatus.ACCEPTED
            db.commit()
            db.refresh(trip)
        # ACCEPTED / EN_ROUTE / etc.: idempotent
    elif target == "in_progress":
        if cur in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise HTTPException(status_code=400, detail="Trip already finished")
        if cur not in (
            TripStatus.ASSIGNED,
            TripStatus.ACCEPTED,
            TripStatus.EN_ROUTE,
            TripStatus.ARRIVED,
            TripStatus.IN_PROGRESS,
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot start trip from status {cur.value if hasattr(cur, 'value') else cur}",
            )
        if cur != TripStatus.IN_PROGRESS:
            TripService.update_status(db, trip, TripStatus.IN_PROGRESS)
        else:
            db.refresh(trip)
    elif target == "completed":
        if cur == TripStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Trip cancelled")
        if cur != TripStatus.IN_PROGRESS:
            raise HTTPException(
                status_code=400,
                detail="Trip must be in_progress before completed",
            )
        TripService.update_status(db, trip, TripStatus.COMPLETED)
    else:
        raise HTTPException(status_code=400, detail="Invalid status")

    db.refresh(trip)
    return DriverTripStatusResponse(
        success=True,
        trip_id=int(trip.id),
        status=_trip_status_to_mobile(trip.status),
    )


@router.get("/trips/{trip_id}", response_model=DriverTripOut)
def get_driver_trip(
    trip_id: int,
    driver_id: int | None = Query(None, description="Optional; defaults to JWT driver id"),
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> DriverTripOut:
    """
    Driver-scoped trip details (includes coordinates for navigation).
    ``driver_id`` query is optional; must match the authenticated driver when provided.
    """
    did = _driver_id_from_auth(auth)
    if driver_id is not None and int(driver_id) != did:
        raise HTTPException(status_code=403, detail="Forbidden")
    driver_id = did
    trip = (
        db.query(Trip)
        .options(joinedload(Trip.booking), joinedload(Trip.vehicle))
        .filter(Trip.id == trip_id)
        .first()
    )
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    if getattr(trip, "driver_id", None) is None:
        raise HTTPException(status_code=400, detail="Trip is not assigned to a driver")

    if int(getattr(trip, "driver_id")) != int(driver_id):
        raise HTTPException(status_code=403, detail="Driver not authorized for this trip")

    if TripService.ensure_trip_vehicle_matches_driver(db, trip):
        try:
            db.commit()
            db.refresh(trip)
        except Exception:
            db.rollback()

    booking = getattr(trip, "booking", None)

    pickup_lat = getattr(trip, "pickup_lat", None)
    if pickup_lat is None:
        pickup_lat = getattr(trip, "pickup_latitude", None)
    pickup_lng = getattr(trip, "pickup_lng", None)
    if pickup_lng is None:
        pickup_lng = getattr(trip, "pickup_longitude", None)

    if pickup_lat is None and booking is not None:
        pickup_lat = getattr(booking, "pickup_latitude", None)
        if pickup_lat is None:
            pickup_lat = getattr(booking, "pickup_lat", None)
    if pickup_lng is None and booking is not None:
        pickup_lng = getattr(booking, "pickup_longitude", None)
        if pickup_lng is None:
            pickup_lng = getattr(booking, "pickup_lng", None)

    destination_lat = None
    destination_lng = None
    # Prefer trip-level destination coords if present, else booking fallback.
    destination_lat = getattr(trip, "destination_lat", None)
    if destination_lat is None:
        destination_lat = getattr(trip, "dropoff_lat", None) or getattr(trip, "dropoff_latitude", None)
    destination_lng = getattr(trip, "destination_lng", None)
    if destination_lng is None:
        destination_lng = getattr(trip, "dropoff_lng", None) or getattr(trip, "dropoff_longitude", None)
    if booking is not None:
        if destination_lat is None:
            destination_lat = getattr(booking, "dropoff_latitude", None)
            if destination_lat is None:
                destination_lat = getattr(booking, "dropoff_lat", None)
        if destination_lng is None:
            destination_lng = getattr(booking, "dropoff_longitude", None)
            if destination_lng is None:
                destination_lng = getattr(booking, "dropoff_lng", None)

    # Best-effort: if coordinates are missing, geocode from address text (Nominatim).
    # Persist to Trip so driver navigation stays enabled.
    changed = False
    pickup_text = (getattr(trip, "pickup", None) or (getattr(booking, "pickup", None) if booking else "") or "").strip()
    dest_text = (
        getattr(trip, "destination", None)
        or (getattr(booking, "destination", None) if booking else "")
        or ""
    ).strip()

    if (pickup_lat is None or pickup_lng is None) and pickup_text:
        g = geocode_address(pickup_text)
        if g is not None:
            glat, glng = g
            pickup_lat = float(glat)
            pickup_lng = float(glng)
            try:
                trip.pickup_lat = pickup_lat
                trip.pickup_lng = pickup_lng
                changed = True
            except Exception:
                pass

    if (destination_lat is None or destination_lng is None) and dest_text:
        g = geocode_address(dest_text)
        if g is not None:
            glat, glng = g
            destination_lat = float(glat)
            destination_lng = float(glng)
            try:
                trip.destination_lat = destination_lat
                trip.destination_lng = destination_lng
                changed = True
            except Exception:
                pass

    if changed:
        try:
            db.commit()
            db.refresh(trip)
        except Exception:
            db.rollback()

    trip_price = None
    driver_earnings = None
    platform_fee = None
    commission_rate_out = None
    if booking is not None:
        g, c, d = split_for_booking_and_trip(booking=booking, trip=trip, gross_override=None)
        trip_price = g if g > 0 else None
        driver_earnings = d if g > 0 else None
        platform_fee = c if g > 0 else None
        commission_rate_out = effective_commission_rate(trip)

    v = getattr(trip, "vehicle", None)
    if v is None and getattr(trip, "vehicle_id", None) is not None:
        v = db.query(Vehicle).filter(Vehicle.id == int(trip.vehicle_id)).first()
    driver_row = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    type_fallback = getattr(driver_row, "vehicle_type", None) if driver_row is not None else None
    vehicle_out = None
    if v is not None:
        vehicle_out = VehicleSummary(
            plate_number=getattr(v, "plate", None),
            model=getattr(v, "name", None),
            type=(getattr(v, "vehicle_type", None) or type_fallback),
        )
    elif type_fallback or (
        driver_row is not None and (getattr(driver_row, "vehicle_plate_number", None) or "").strip()
    ):
        vehicle_out = VehicleSummary(
            plate_number=(
                (getattr(driver_row, "vehicle_plate_number", None) or "").strip() or None
                if driver_row is not None
                else None
            ),
            model=None,
            type=type_fallback,
        )

    seats = int(getattr(trip, "passengers", 0) or 0)
    if booking is not None and seats <= 0:
        seats = int(getattr(booking, "people", 1) or 1)
    if seats <= 0:
        seats = 1

    return DriverTripOut(
        trip_id=trip.id,
        driver_id=int(getattr(trip, "driver_id")),
        status=(trip.status.value if hasattr(trip.status, "value") else str(trip.status)),
        mobile_status=_trip_status_to_mobile(trip.status),
        customer_name=(getattr(booking, "customer_name", None) if booking else None),
        customer_phone=(getattr(booking, "phone", None) if booking else None),
        seats=seats,
        pickup=getattr(trip, "pickup", None) or (getattr(booking, "pickup", None) if booking else None),
        destination=getattr(trip, "destination", None)
        or (getattr(booking, "destination", None) if booking else None),
        pickup_lat=(float(pickup_lat) if pickup_lat is not None else None),
        pickup_lng=(float(pickup_lng) if pickup_lng is not None else None),
        destination_lat=(float(destination_lat) if destination_lat is not None else None),
        destination_lng=(float(destination_lng) if destination_lng is not None else None),
        start_km=getattr(trip, "start_km", None),
        end_km=getattr(trip, "end_km", None),
        service_start_time=getattr(trip, "service_start_time", None),
        service_end_time=getattr(trip, "service_end_time", None),
        trip_price=trip_price,
        driver_earnings=driver_earnings,
        platform_fee=platform_fee,
        commission_rate=commission_rate_out,
        vehicle=vehicle_out,
    )


@router.post("/trips/{trip_id}/update-service")
def update_service_data(
    trip_id: int,
    payload: UpdateServiceBody,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> dict:
    """
    Driver-scoped endpoint to update service data on the assigned trip only.
    Does not affect dispatch/admin endpoints.
    """
    if str(int(payload.driver_id)) != str(auth.get("sub")):
        raise HTTPException(status_code=403, detail="Forbidden")
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    if getattr(trip, "driver_id", None) is None:
        raise HTTPException(status_code=400, detail="Trip is not assigned to a driver")

    if int(getattr(trip, "driver_id")) != int(payload.driver_id):
        raise HTTPException(status_code=403, detail="Driver not authorized for this trip")

    fields_set = getattr(payload, "model_fields_set", set()) or set()
    if "start_km" in fields_set:
        trip.start_km = payload.start_km
    if "end_km" in fields_set:
        trip.end_km = payload.end_km
    if "service_start_time" in fields_set:
        trip.service_start_time = payload.service_start_time
    if "service_end_time" in fields_set:
        trip.service_end_time = payload.service_end_time

    # Validate KM if we have both values (either provided or already stored)
    if trip.start_km is not None and trip.end_km is not None:
        try:
            if float(trip.end_km) <= float(trip.start_km):
                raise HTTPException(status_code=400, detail="end_km must be greater than start_km")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid KM values")

    # Validate service times if we have both values
    if trip.service_start_time is not None and trip.service_end_time is not None:
        if trip.service_end_time <= trip.service_start_time:
            raise HTTPException(status_code=400, detail="End time must be after start time")

    db.commit()
    db.refresh(trip)

    # Notify admin dashboards in real-time (ws://.../ws/trips).
    manager.broadcast_sync(
        {
            "event": "trip_service_updated",
            "trip_id": trip.id,
            "status": (trip.status.value if hasattr(trip.status, "value") else str(trip.status)),
            "start_km": trip.start_km,
            "end_km": trip.end_km,
            "service_start_time": trip.service_start_time,
            "service_end_time": trip.service_end_time,
        }
    )

    return {
        "success": True,
        "trip_id": trip.id,
        "start_km": trip.start_km,
        "end_km": trip.end_km,
        "service_start_time": trip.service_start_time,
        "service_end_time": trip.service_end_time,
    }


@router.post("/start/{trip_id}")
def start_trip(
    trip_id: int,
    payload: StartTripBody,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_trip_driver_or_admin),
) -> dict:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    if getattr(trip, "driver_id", None) is None:
        raise HTTPException(status_code=400, detail="driver_id is required")

    st = getattr(trip, "status", None)
    if st == TripStatus.COMPLETED or st == TripStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Trip cannot be started in current status")

    trip.status = TripStatus.IN_PROGRESS
    trip.started_at = datetime.utcnow()
    trip.start_km = int(payload.start_km)
    db.commit()
    db.refresh(trip)

    return {"success": True, "status": "in_progress"}


@router.post("/complete/{trip_id}")
def complete_trip(
    trip_id: int,
    payload: CompleteTripBody,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_trip_driver_or_admin),
) -> dict:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    if getattr(trip, "driver_id", None) is None:
        raise HTTPException(status_code=400, detail="driver_id is required")

    trip.status = TripStatus.COMPLETED
    trip.completed_at = datetime.utcnow()
    trip.end_km = int(payload.end_km)
    db.commit()
    db.refresh(trip)

    # Optional email after completion (best-effort; never breaks endpoint)
    try:
        import os

        data = build_service_sheet_data(db=db, trip_id=trip_id)
        if data is not None:
            pdf_bytes = generate_service_sheet_pdf_bytes(data.to_dict())
            pdf_filename = f"service_sheet_{trip_id}.pdf"

            company_email = os.getenv("COMPANY_EMAIL")
            if company_email:
                send_email(
                    to_email=company_email,
                    subject=f"Service sheet completed (trip #{trip_id})",
                    body=f"Service sheet for trip #{trip_id} is attached.",
                    attachment_bytes=pdf_bytes,
                    attachment_filename=pdf_filename,
                )

            driver = db.query(Driver).filter(Driver.id == trip.driver_id).first()
            driver_email = (getattr(driver, "email", None) or "").strip() if driver else ""
            if driver_email:
                send_email(
                    to_email=driver_email,
                    subject="Service Sheet - Trip Completed",
                    body="Attached your service sheet.",
                    attachment_bytes=pdf_bytes,
                    attachment_filename=pdf_filename,
                )
    except Exception:
        pass

    return {"success": True, "status": "completed"}

