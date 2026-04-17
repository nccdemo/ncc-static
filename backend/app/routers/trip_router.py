from datetime import date as Date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import (
    get_actor_context,
    require_admin,
    require_admin_or_driver_self,
    require_driver,
    require_trip_driver_or_admin,
)
from app.models.driver import Driver
from app.models.tour_instance import TourInstance
from app.models.trip import Trip, TripStatus
from app.models.vehicle import Vehicle
from app.services.trip_service import TripService
from app.services.trip_service_sheet_pdf import build_service_sheet_pdf
from app.services.websocket_manager import manager

router = APIRouter(prefix="/trips", tags=["Trips"])


class TripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    booking_id: int | None = None
    tour_instance_id: int | None = None
    driver_id: int | None = None
    vehicle_id: int | None = None
    service_date: Date | None = None
    status: TripStatus
    assigned_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class TripAdminListRow(BaseModel):
    """Admin trip table row (list + driver display name)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    status: TripStatus
    driver_id: int | None = None
    driver_name: str | None = None
    vehicle_id: int | None = None
    service_date: Date | None = None
    tour_instance_id: int | None = None


class TripDispatchCreateRequest(BaseModel):
    """Body for ``POST /api/trips`` manual transfer (customer + route + time, no driver yet)."""

    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    customer_name: str = Field(min_length=1)
    pickup: str = Field(min_length=1)
    dropoff: str = Field(min_length=1)
    ride_datetime: datetime = Field(..., alias="datetime")


class TripCreateRequest(BaseModel):
    driver_id: int
    vehicle_id: int
    tour_instance_id: int
    date: Date


class TripStatusUpdate(BaseModel):
    status: TripStatus


class TripAssignRequest(BaseModel):
    driver_id: int
    vehicle_id: int | None = None


class TripTrackingResponse(BaseModel):
    trip_id: int
    status: TripStatus
    driver: dict | None = None
    pickup: dict | None = None
    dropoff: dict | None = None
    eta_to_pickup_minutes: int | None = None
    eta_to_destination_minutes: int | None = None


class ServiceSheetDriverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    phone: str


class ServiceSheetVehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    plate: str | None


class ServiceSheetBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_name: str
    phone: str
    people: int
    checked_in: bool
    pickup_latitude: float | None
    pickup_longitude: float | None


class ServiceSheetOut(BaseModel):
    driver: ServiceSheetDriverOut | None = None
    vehicle: ServiceSheetVehicleOut | None = None
    service_date: Date | None = None
    bookings: list[ServiceSheetBookingOut]


def _get_trip_or_404(db: Session, trip_id: int) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.get("/", response_model=list[TripAdminListRow])
def list_trips(
    db: Session = Depends(get_db),
    actor: dict = Depends(get_actor_context),
    limit: int = Query(500, ge=1, le=2000, description="Max rows (newest first)."),
) -> list[TripAdminListRow]:
    """Trips list (admin: all, company: scoped)."""
    q = db.query(Trip).options(joinedload(Trip.driver)).order_by(Trip.id.desc()).limit(int(limit))
    if actor["role"] != "admin":
        q = q.filter(Trip.company_id == int(actor["company_id"]))
    trips = q.all()
    out: list[TripAdminListRow] = []
    for t in trips:
        dname = None
        if t.driver is not None:
            dname = str(getattr(t.driver, "name", "") or "").strip() or None
        out.append(
            TripAdminListRow(
                id=int(t.id),
                status=t.status,
                driver_id=t.driver_id,
                driver_name=dname,
                vehicle_id=t.vehicle_id,
                service_date=t.service_date,
                tour_instance_id=t.tour_instance_id,
            )
        )
    return out


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
def create_trip(
    payload: TripDispatchCreateRequest | TripCreateRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    if isinstance(payload, TripDispatchCreateRequest):
        return TripService.create_dispatch_transfer_trip(
            db,
            customer_name=payload.customer_name,
            pickup=payload.pickup,
            dropoff=payload.dropoff,
            ride_at=payload.ride_datetime,
        )

    driver = db.query(Driver).filter(Driver.id == payload.driver_id).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    vehicle = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    instance = (
        db.query(TourInstance).filter(TourInstance.id == payload.tour_instance_id).first()
    )
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")

    now = datetime.utcnow()
    print("CREATING TRIP WITH STATUS:", TripStatus.SCHEDULED)
    sched = datetime.combine(payload.date, datetime.min.time())
    trip = Trip(
        company_id=getattr(driver, "company_id", None),
        tour_instance_id=payload.tour_instance_id,
        driver_id=payload.driver_id,
        vehicle_id=payload.vehicle_id,
        service_date=payload.date,
        scheduled_at=sched,
        status=TripStatus.SCHEDULED,
        assigned_at=now,
        last_assigned_at=now,
    )
    # Best-effort geocoding (if textual pickup/destination exist on trip object).
    try:
        from app.services.geocoding import geocode_address

        if getattr(trip, "pickup", None) and (getattr(trip, "pickup_lat", None) is None or getattr(trip, "pickup_lng", None) is None):
            g = geocode_address(str(getattr(trip, "pickup", "")))
            if g is not None:
                plat, plng = g
                trip.pickup_lat = plat
                trip.pickup_lng = plng

        if getattr(trip, "destination", None) and (
            getattr(trip, "dropoff_lat", None) is None
            or getattr(trip, "dropoff_lng", None) is None
            or getattr(trip, "destination_lat", None) is None
            or getattr(trip, "destination_lng", None) is None
        ):
            g = geocode_address(str(getattr(trip, "destination", "")))
            if g is not None:
                dlat, dlng = g
                trip.destination_lat = dlat
                trip.destination_lng = dlng
                trip.dropoff_lat = dlat
                trip.dropoff_lng = dlng
    except Exception as e:
        print("Geocoding error:", e)
    db.add(trip)
    db.commit()
    db.refresh(trip)

    print("NEW TRIP CREATED")
    print("Trip ID:", trip.id)
    print("Trip company_id:", trip.company_id)

    # Best-effort email: never break trip creation flow.
    try:
        import os

        from app.services.email_service import send_email

        company_email = (os.getenv("COMPANY_EMAIL") or "").strip()
        if company_email:
            send_email(
                to_email=company_email,
                subject=f"New trip created (#{trip.id})",
                body=f"Trip #{trip.id} created.",
            )
            print("EMAIL SENT")
    except Exception as e:
        print("EMAIL ERROR:", str(e))

    # Trip assigned at creation => driver becomes busy.
    if getattr(driver, "status", None) != "on_trip":
        driver.status = "on_trip"
        db.commit()
        db.refresh(driver)
        manager.broadcast_drivers_sync(
            {
                "driver_id": driver.id,
                "latitude": driver.latitude,
                "longitude": driver.longitude,
                "name": driver.name,
                "status": driver.status,
            }
        )

    manager.broadcast_sync(
        {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
    )
    return trip


_TRIP_ACTIVE_FOR_INSTANCES: tuple[TripStatus, ...] = (
    TripStatus.SCHEDULED,
    TripStatus.PENDING,
    TripStatus.ASSIGNED,
    TripStatus.ACCEPTED,
    TripStatus.EN_ROUTE,
    TripStatus.ARRIVED,
    TripStatus.IN_PROGRESS,
)


@router.get("/active")
def list_active_trips_simple(
    db: Session = Depends(get_db),
    actor: dict = Depends(get_actor_context),
) -> list[dict[str, Any]]:
    """Lightweight active trips for admin Instances page (must be registered before /{trip_id})."""
    q = (
        db.query(Trip)
        .options(joinedload(Trip.booking))
        .filter(Trip.status.in_(_TRIP_ACTIVE_FOR_INSTANCES))
        .order_by(Trip.id.desc())
    )
    if actor["role"] != "admin":
        q = q.filter(Trip.company_id == int(actor["company_id"]))
    trips = q.all()
    out: list[dict[str, Any]] = []
    for t in trips:
        st = t.status.value.lower() if hasattr(t.status, "value") else str(t.status).lower()
        booking = t.booking
        client_id = t.company_id
        if client_id is None and booking is not None:
            client_id = getattr(booking, "id", None)
        out.append(
            {
                "id": t.id,
                "client_id": client_id,
                "driver_id": t.driver_id,
                "pickup_lat": t.pickup_lat,
                "pickup_lng": t.pickup_lng,
                "status": st,
            }
        )
    return out


@router.get("/driver/{driver_id}/active")
def list_driver_active_trips(
    driver_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_admin_or_driver_self),
) -> list[dict[str, Any]]:
    """Active trips assigned to this driver (NCC + tour / instance)."""
    trips = (
        db.query(Trip)
        .options(joinedload(Trip.bookings), joinedload(Trip.vehicle))
        .filter(
            Trip.driver_id == int(driver_id),
            Trip.driver_id.isnot(None),
            Trip.status.in_(_TRIP_ACTIVE_FOR_INSTANCES),
        )
        .order_by(Trip.id.desc())
        .all()
    )
    out: list[dict[str, Any]] = []
    for t in trips:
        st = t.status.value if hasattr(t.status, "value") else str(t.status)
        v = t.vehicle
        out.append(
            {
                "id": t.id,
                "status": str(st).lower(),
                "service_date": t.service_date.isoformat() if getattr(t, "service_date", None) else None,
                "vehicle": (
                    {"name": v.name, "plate": getattr(v, "plate", None)}
                    if v is not None
                    else None
                ),
                "bookings": [
                    {"id": int(b.id), "checked_in": bool(getattr(b, "checked_in", False))}
                    for b in list(t.bookings or [])
                ],
            }
        )
    return out


@router.get("/available")
def list_available_marketplace_trips(
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_driver),
) -> list[dict[str, Any]]:
    """Marketplace: all trips with no driver assigned (driver_id IS NULL). Dispatch/admin flows unchanged."""
    trips = (
        db.query(Trip)
        .options(joinedload(Trip.booking))
        .filter(
            Trip.driver_id.is_(None),
            Trip.status.in_((TripStatus.SCHEDULED, TripStatus.PENDING)),
        )
        .order_by(Trip.id.desc())
        .all()
    )
    out: list[dict[str, Any]] = []
    for t in trips:
        booking = t.booking
        price = getattr(t, "price", None)
        if price is None and booking is not None:
            price = getattr(booking, "price", None)
        eta = getattr(t, "eta", None)
        time_label = None
        if eta is not None:
            try:
                time_label = eta.isoformat()
            except Exception:
                time_label = str(eta)
        elif booking is not None:
            bd = getattr(booking, "date", None)
            bt = getattr(booking, "time", None)
            if bd is not None and bt is not None:
                tpart = bt.isoformat() if hasattr(bt, "isoformat") else str(bt)
                time_label = f"{bd.isoformat()} {tpart}"
            elif bd is not None:
                time_label = bd.isoformat()
        out.append(
            {
                "id": int(t.id),
                "pickup": getattr(t, "pickup", None) or (getattr(booking, "pickup", None) if booking else None),
                "destination": getattr(t, "destination", None)
                or (getattr(booking, "destination", None) if booking else None),
                "price": float(price) if price is not None else None,
                "time": time_label,
                "service_date": t.service_date.isoformat() if getattr(t, "service_date", None) else None,
                "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            }
        )
    return out


@router.get("/{trip_id}", response_model=TripResponse)
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    return trip


@router.patch("/{trip_id}/status", response_model=TripResponse)
def update_trip_status(
    trip_id: int,
    payload: TripStatusUpdate,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    return TripService.update_status(db=db, trip=trip, status=payload.status)


@router.post("/{trip_id}/complete", response_model=TripResponse)
def complete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    return TripService.update_status(db=db, trip=trip, status=TripStatus.COMPLETED)


@router.post("/{trip_id}/assign", response_model=TripResponse)
def assign_trip(
    trip_id: int,
    payload: TripAssignRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    return TripService.assign_driver(
        db=db,
        trip=trip,
        driver_id=payload.driver_id,
        vehicle_id=payload.vehicle_id,
    )


@router.post("/{trip_id}/cancel", response_model=TripResponse)
def admin_cancel_trip_endpoint(
    trip_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    """Admin: set trip to ``CANCELLED`` and release driver/vehicle."""
    trip = _get_trip_or_404(db, trip_id)
    return TripService.admin_cancel_trip(db=db, trip=trip)


@router.post("/{trip_id}/accept", response_model=TripResponse)
def accept_trip_marketplace(
    trip_id: int,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> Trip:
    """
    Marketplace accept: authenticated driver claims an open trip.

    Sets ``trip.driver_id`` and ``status`` to ASSIGNED, persists, broadcasts ``trip_updated`` (WebSocket).
    Atomic update prevents double assignment; 409 if another driver already holds the trip.
    """
    did = int(auth.get("sub", 0) or 0)
    if did <= 0:
        raise HTTPException(status_code=403, detail="Invalid driver token")
    return TripService.driver_claim_trip(db=db, trip_id=trip_id, driver_id=did)


@router.post("/{trip_id}/confirm-assignment", response_model=TripResponse)
def confirm_assigned_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    """Admin: move ASSIGNED trip to ACCEPTED (legacy flow)."""
    trip = _get_trip_or_404(db, trip_id)
    return TripService.accept_trip(db=db, trip=trip)


@router.post("/{trip_id}/reject", response_model=TripResponse)
def reject_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    return TripService.reject_trip(db=db, trip=trip)


@router.get("/{trip_id}/tracking", response_model=TripTrackingResponse)
def get_trip_tracking(
    trip_id: int,
    db: Session = Depends(get_db),
) -> dict:
    trip = _get_trip_or_404(db, trip_id)

    booking = trip.booking
    # Prefer trip-level coords; fallback to booking-level.
    dropoff_lat = getattr(trip, "dropoff_lat", None)
    dropoff_lng = getattr(trip, "dropoff_lng", None)
    if dropoff_lat is None and booking is not None:
        dropoff_lat = getattr(booking, "dropoff_latitude", None)
    if dropoff_lng is None and booking is not None:
        dropoff_lng = getattr(booking, "dropoff_longitude", None)

    driver = None
    if trip.driver_id is not None:
        driver = db.query(Driver).filter(Driver.id == trip.driver_id).first()

    from app.services.dispatch_service import (
        compute_eta_to_pickup_minutes,
        estimate_eta_km,
        haversine_distance,
        resolve_pickup_lat_lng,
    )

    try:
        pickup_lat, pickup_lng = resolve_pickup_lat_lng(trip, booking)
    except Exception:
        pickup_lat, pickup_lng = None, None
    eta_to_pickup = None
    if driver:
        dlat = getattr(driver, "latitude", None)
        dlng = getattr(driver, "longitude", None)
        if (
            dlat is not None
            and dlng is not None
            and pickup_lat is not None
            and pickup_lng is not None
        ):
            try:
                eta_to_pickup = compute_eta_to_pickup_minutes(
                    dlat,
                    dlng,
                    pickup_lat,
                    pickup_lng,
                )
            except Exception:
                eta_to_pickup = None

    eta_to_destination = None
    if (
        pickup_lat is not None
        and pickup_lng is not None
        and dropoff_lat is not None
        and dropoff_lng is not None
    ):
        try:
            dist2 = haversine_distance(
                float(pickup_lat),
                float(pickup_lng),
                float(dropoff_lat),
                float(dropoff_lng),
            )
            eta_to_destination = estimate_eta_km(dist2)
        except Exception:
            eta_to_destination = None

    return {
        "trip_id": trip.id,
        "status": trip.status,
        "driver": (
            {
                "driver_id": driver.id,
                "lat": getattr(driver, "latitude", None),
                "lng": getattr(driver, "longitude", None),
                "last_location_update": driver.last_location_update,
            }
            if driver
            else None
        ),
        "pickup": (
            {"lat": pickup_lat, "lng": pickup_lng}
            if pickup_lat is not None and pickup_lng is not None
            else None
        ),
        "dropoff": (
            {"lat": dropoff_lat, "lng": dropoff_lng}
            if dropoff_lat is not None and dropoff_lng is not None
            else None
        ),
        "eta_to_pickup_minutes": eta_to_pickup,
        "eta_to_destination_minutes": eta_to_destination,
    }


@router.get("/{trip_id}/service-sheet", response_model=ServiceSheetOut)
def get_trip_service_sheet(
    trip_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_trip_driver_or_admin),
) -> ServiceSheetOut:
    try:
        trip = (
            db.query(Trip)
            .options(
                joinedload(Trip.driver),
                joinedload(Trip.vehicle),
                joinedload(Trip.bookings),
            )
            .filter(Trip.id == trip_id)
            .first()
        )
        if trip is None:
            raise HTTPException(status_code=404, detail="Trip not found")

        d = trip.driver
        v = trip.vehicle

        bookings_out: list[ServiceSheetBookingOut] = []
        for b in list(trip.bookings or []):
            bookings_out.append(
                ServiceSheetBookingOut(
                    id=int(getattr(b, "id", 0) or 0),
                    customer_name=str(getattr(b, "customer_name", None) or "—"),
                    phone=str(getattr(b, "phone", None) or "—"),
                    people=int(getattr(b, "people", 0) or 0),
                    checked_in=bool(getattr(b, "checked_in", False)),
                    pickup_latitude=getattr(b, "pickup_latitude", None),
                    pickup_longitude=getattr(b, "pickup_longitude", None),
                )
            )

        return ServiceSheetOut(
            driver=(
                ServiceSheetDriverOut(
                    name=str(getattr(d, "name", None) or "N/A"),
                    phone=str(getattr(d, "phone", None) or "N/A"),
                )
                if d is not None
                else None
            ),
            vehicle=(
                ServiceSheetVehicleOut(
                    name=str(getattr(v, "name", None) or "N/A"),
                    plate=(str(getattr(v, "plate", None)) if getattr(v, "plate", None) else None),
                )
                if v is not None
                else None
            ),
            service_date=getattr(trip, "service_date", None),
            bookings=bookings_out,
        )
    except HTTPException:
        raise
    except Exception as e:
        print("ERROR GET /trips/{id}/service-sheet:", trip_id, str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to build service sheet data",
        ) from e


@router.get("/{trip_id}/pdf")
def get_trip_service_sheet_pdf(
    trip_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_trip_driver_or_admin),
) -> Response:
    trip = (
        db.query(Trip)
        .options(
            joinedload(Trip.driver),
            joinedload(Trip.vehicle),
            joinedload(Trip.bookings),
        )
        .filter(Trip.id == trip_id)
        .first()
    )
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    try:
        pdf_bytes = build_service_sheet_pdf(
            trip=trip,
            driver=trip.driver,
            vehicle=trip.vehicle,
            bookings=list(trip.bookings or []),
        )
    except Exception as e:
        print("ERROR GET /trips/{id}/pdf:", trip_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to generate PDF") from e
    filename = f"service-sheet-trip-{trip_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
