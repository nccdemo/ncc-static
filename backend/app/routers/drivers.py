from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, Response, status
from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.crud.driver import (
    activate_driver,
    approve_driver_signup,
    create_driver,
    delete_driver,
    get_drivers,
    reject_driver_signup,
)
from app.database import get_db
from app.deps.auth import (
    require_admin,
    require_admin_or_driver_self,
    require_driver,
)
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.trip import Trip, TripStatus
from app.services.trip_service import TripService
from app.schemas.driver import (
    DriverCreate,
    DriverPendingSignupResponse,
    DriverRegisterRequest,
    DriverResponse,
)
from app.services.driver_registration import register_public_driver
from app.services.websocket_manager import manager

router = APIRouter(prefix="/drivers", tags=["drivers"])

driver_locations: dict[int, dict] = {}

# Driver app list: assigned vs actively serving (normalized to "assigned" | "on_trip").
_DRIVER_TRIPS_ASSIGNED: tuple[TripStatus, ...] = (TripStatus.ASSIGNED,)
_DRIVER_TRIPS_ON_TRIP: tuple[TripStatus, ...] = (
    TripStatus.ACCEPTED,
    TripStatus.EN_ROUTE,
    TripStatus.ARRIVED,
    TripStatus.IN_PROGRESS,
)
_DRIVER_TRIPS_VISIBLE: tuple[TripStatus, ...] = _DRIVER_TRIPS_ASSIGNED + _DRIVER_TRIPS_ON_TRIP


def _driver_app_trip_vehicle(trip: Trip, driver: Driver | None) -> dict[str, Any] | None:
    v = trip.vehicle
    if v is not None:
        vtype = getattr(v, "vehicle_type", None) or (
            getattr(driver, "vehicle_type", None) if driver is not None else None
        )
        return {
            "name": v.name,
            "plate": getattr(v, "plate", None),
            "plate_number": getattr(v, "plate", None),
            "model": v.name,
            "type": vtype,
        }
    if driver is None:
        return None
    plate = (getattr(driver, "vehicle_plate_number", None) or "").strip() or None
    vt = getattr(driver, "vehicle_type", None)
    if not plate and not vt:
        return None
    return {
        "name": None,
        "plate": None,
        "plate_number": plate,
        "model": None,
        "type": vt,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_driver_public(
    payload: DriverRegisterRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Public signup (legacy path); same logic as POST /api/auth/driver/register (without token in JSON)."""
    result = register_public_driver(
        db,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        vehicle_plate_number=payload.plate_number,
        vehicle_type=payload.vehicle_type,
        vehicle_seats=payload.seats,
        driver_license_number=payload.driver_license_number,
        ncc_license_number=payload.ncc_license_number,
        insurance_number=payload.insurance_number,
    )
    return {
        "id": result["id"],
        "signup_status": result["signup_status"],
        "message": result["message"],
    }


@router.get("/pending-signups", response_model=list[DriverPendingSignupResponse])
def list_pending_signups(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[Driver]:
    return (
        db.query(Driver)
        .filter(Driver.signup_status == "pending")
        .order_by(Driver.id.desc())
        .all()
    )


@router.post("/{driver_id}/approve-signup", response_model=DriverResponse)
def approve_signup_endpoint(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Driver:
    d = approve_driver_signup(db, driver_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Pending driver not found")
    return d


@router.post("/{driver_id}/reject-signup")
def reject_signup_endpoint(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    d = reject_driver_signup(db, driver_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Pending driver not found")
    return {"id": d.id, "signup_status": d.signup_status}


@router.patch("/{driver_id}/activate", response_model=DriverResponse)
def activate_driver_endpoint(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Driver:
    d = activate_driver(db, driver_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    return d


@router.get("/{driver_id}/trips")
def list_driver_trips_for_app(
    driver_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_admin_or_driver_self),
) -> list[dict[str, Any]]:
    """
    Trips for the driver app: only assigned or on-trip work (not completed/cancelled).
    Status in JSON is normalized to \"assigned\" or \"on_trip\".
    """
    did = int(driver_id)
    driver = db.query(Driver).filter(Driver.id == did).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Heal: booking names this driver but trip.driver_id was never set.
    subq = (
        db.query(Trip.id)
        .join(Booking, Booking.trip_id == Trip.id)
        .filter(
            Booking.driver_id == did,
            Trip.driver_id.is_(None),
            Trip.status.in_(_DRIVER_TRIPS_VISIBLE),
        )
        .distinct()
    )
    inconsistent = db.query(Trip).filter(Trip.id.in_(subq)).all()
    if inconsistent:
        for t in inconsistent:
            t.driver_id = did
            db.add(t)
            TripService.ensure_trip_vehicle_matches_driver(db, t)
        db.commit()

    trips = (
        db.query(Trip)
        .options(joinedload(Trip.bookings), joinedload(Trip.vehicle))
        .filter(
            Trip.driver_id == did,
            Trip.driver_id.isnot(None),
            Trip.status.in_(_DRIVER_TRIPS_VISIBLE),
        )
        .order_by(Trip.id.desc())
        .all()
    )
    sync_vehicle = False
    for t in trips:
        if TripService.ensure_trip_vehicle_matches_driver(db, t):
            sync_vehicle = True
    if sync_vehicle:
        db.commit()
        for rt in trips:
            db.refresh(rt)

    out: list[dict[str, Any]] = []
    for t in trips:
        st = t.status
        label = "assigned" if st == TripStatus.ASSIGNED else "on_trip"
        out.append(
            {
                "id": t.id,
                "driver_id": int(t.driver_id),
                "status": label,
                "service_date": t.service_date.isoformat() if getattr(t, "service_date", None) else None,
                "vehicle": _driver_app_trip_vehicle(t, driver),
                "bookings": [
                    {"id": int(b.id), "checked_in": bool(getattr(b, "checked_in", False))}
                    for b in list(t.bookings or [])
                ],
            }
        )
    return out


_TRIP_ADMIN_ASSIGNED_STATUSES: tuple[TripStatus, ...] = (
    TripStatus.SCHEDULED,
    TripStatus.PENDING,
    TripStatus.ASSIGNED,
    TripStatus.ACCEPTED,
    TripStatus.EN_ROUTE,
    TripStatus.ARRIVED,
    TripStatus.IN_PROGRESS,
)


def _serialize_trip_admin_row(t: Trip) -> dict[str, Any]:
    v = t.vehicle
    st = t.status
    return {
        "id": int(t.id),
        "status": str(st.value if hasattr(st, "value") else st).lower(),
        "service_date": t.service_date.isoformat() if getattr(t, "service_date", None) else None,
        "pickup": t.pickup,
        "destination": t.destination,
        "vehicle": (
            {"name": v.name, "plate": getattr(v, "plate", None)}
            if v is not None
            else None
        ),
    }


@router.get("/{driver_id}/trips-admin")
def list_driver_trips_admin(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    """Admin driver card: open assignments vs completed history."""
    did = int(driver_id)
    driver = db.query(Driver).filter(Driver.id == did).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    assigned_rows = (
        db.query(Trip)
        .options(joinedload(Trip.vehicle))
        .filter(
            Trip.driver_id == did,
            Trip.driver_id.isnot(None),
            Trip.status.in_(_TRIP_ADMIN_ASSIGNED_STATUSES),
        )
        .order_by(Trip.id.desc())
        .limit(200)
        .all()
    )
    completed_rows = (
        db.query(Trip)
        .options(joinedload(Trip.vehicle))
        .filter(
            Trip.driver_id == did,
            Trip.status == TripStatus.COMPLETED,
        )
        .order_by(Trip.id.desc())
        .limit(100)
        .all()
    )
    return {
        "assigned": [_serialize_trip_admin_row(t) for t in assigned_rows],
        "completed": [_serialize_trip_admin_row(t) for t in completed_rows],
    }


@router.get("/{driver_id}/location")
def get_driver_live_location(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    """
    Return driver's last known location.

    - Prefer in-memory location updates (POST /api/drivers/location).
    - Fallback to persisted columns on Driver (POST /api/drivers/{id}/location).

    Never 404 just because we don't have a location yet; returns null fields instead.
    """
    did = int(driver_id)
    loc = driver_locations.get(did)
    if loc and loc.get("lat") is not None and loc.get("lng") is not None:
        return {
            "driver_id": did,
            "lat": loc.get("lat"),
            "lng": loc.get("lng"),
            "timestamp": loc.get("timestamp"),
        }

    driver = db.query(Driver).filter(Driver.id == did).first()
    if driver is None:
        # Requirement: NEVER return 404; return nulls when no data exists.
        return {
            "driver_id": did,
            "lat": None,
            "lng": None,
            "timestamp": None,
        }

    return {
        "driver_id": did,
        "lat": getattr(driver, "latitude", None),
        "lng": getattr(driver, "longitude", None),
        "timestamp": getattr(driver, "last_location_update", None),
    }


@router.get("/", response_model=list[DriverResponse])
def list_drivers(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[DriverResponse]:
    return get_drivers(db)


@router.post("/", response_model=DriverResponse, status_code=status.HTTP_201_CREATED)
def create_driver_endpoint(
    payload: DriverCreate,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> DriverResponse:
    return create_driver(db, payload)


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver_endpoint(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Response:
    if not delete_driver(db, driver_id):
        raise HTTPException(status_code=404, detail="Driver not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float


class DriverLocationPost(BaseModel):
    driver_id: int
    # Accept both {latitude, longitude} and {lat, lng}
    latitude: float = Field(alias="lat")
    longitude: float = Field(alias="lng")

    model_config = {"populate_by_name": True}


@router.post("/location")
def post_driver_location(
    data: dict = Body(default_factory=dict),
    payload: dict = Depends(require_driver),
) -> dict:
    print("HIT DRIVER LOCATION ENDPOINT")
    print("DATA:", data)

    driver_id = data.get("driver_id")
    if driver_id is None or str(int(driver_id)) != str(payload.get("sub")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    lat = data.get("lat", data.get("latitude"))
    lng = data.get("lng", data.get("longitude"))

    print("DRIVER LOCATION:", driver_id, lat, lng)

    # Store location in memory (best-effort; never crash).
    try:
        if driver_id is not None and lat is not None and lng is not None:
            now = datetime.utcnow()
            did = int(driver_id)
            driver_locations[did] = {
                "lat": float(lat),
                "lng": float(lng),
                "timestamp": now,
            }
            print("=== SAVE DRIVER LOCATION ===")
            print("DRIVER ID:", did)
            print("LAT/LNG:", float(lat), float(lng))
            print("ALL LOCATIONS:", driver_locations)
    except Exception:
        pass

    return {"status": "ok"}


@router.post("/{driver_id}/location")
def update_driver_location(
    driver_id: int,
    payload: DriverLocationUpdate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_admin_or_driver_self),
) -> dict:
    _ = auth
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    driver.latitude = payload.latitude
    driver.longitude = payload.longitude
    driver.last_location_update = datetime.utcnow()
    db.commit()
    db.refresh(driver)

    manager.broadcast_sync(
        {
            "event": "driver_location_update",
            "driver_id": driver.id,
            "lat": driver.latitude,
            "lng": driver.longitude,
        }
    )

    return {
        "driver_id": driver.id,
        "latitude": driver.latitude,
        "longitude": driver.longitude,
        "last_location_update": driver.last_location_update,
    }
