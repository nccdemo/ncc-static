from datetime import date, datetime, time

import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_admin, require_trip_driver_or_admin
from app.dependencies.company import get_current_company
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.trip import Trip, TripStatus
from app.models.vehicle import Vehicle
from app.services.dispatch_service import get_available_drivers
from app.services.trip_service import TripService
from app.services.websocket_manager import manager

router = APIRouter(prefix="/dispatch", tags=["Dispatch"])


ACTIVE_DASHBOARD_STATUSES: tuple[TripStatus, ...] = (
    TripStatus.SCHEDULED,
    TripStatus.PENDING,
    TripStatus.ASSIGNED,
    TripStatus.ACCEPTED,
    TripStatus.EN_ROUTE,
    TripStatus.ARRIVED,
    TripStatus.IN_PROGRESS,
)


class BookingInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_name: str
    email: str
    phone: str
    date: date
    time: time
    people: int
    flight_number: str | None = None
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    dropoff_latitude: float | None = None
    dropoff_longitude: float | None = None
    status: str


class DriverInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    active: bool = Field(validation_alias="is_active")
    latitude: float | None = None
    longitude: float | None = None
    last_location_update: datetime | None = None


class VehicleInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    seats: int
    active: bool


class TripWithContext(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    booking_id: int | None = None
    driver_id: int | None = None
    vehicle_id: int | None = None
    status: TripStatus
    assigned_at: datetime | None = None
    last_assigned_at: datetime | None = None
    assignment_attempts: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None

    booking: BookingInfo | None = None
    driver: DriverInfo | None = None
    vehicle: VehicleInfo | None = None

    pickup_lat: float | None = None
    pickup_lng: float | None = None
    dropoff_lat: float | None = None
    dropoff_lng: float | None = None
    driver_to_pickup_distance_km: float | None = None
    eta_to_pickup_minutes: int | None = None


class ManualAssignRequest(BaseModel):
    driver_id: int
    vehicle_id: int | None = None


class TripKmUpdateRequest(BaseModel):
    start_km: float | None = None
    end_km: float | None = None
    service_start_time: datetime | None = None
    service_end_time: datetime | None = None


class ActiveTripRow(BaseModel):
    id: int
    status: str
    driver: str | None = None
    pickup: str | None = None
    destination: str | None = None
    eta: datetime | None = None
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    destination_lat: float | None = None
    destination_lng: float | None = None
    eta_to_pickup_minutes: int | None = None
    start_km: float | None = None
    end_km: float | None = None
    service_start_time: datetime | None = None
    service_end_time: datetime | None = None


def _get_trip_or_404(db: Session, trip_id: int) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.put("/trips/{trip_id}", response_model=TripWithContext)
def update_trip(
    trip_id: int,
    payload: TripKmUpdateRequest,
    db: Session = Depends(get_db),
    company=Depends(get_current_company),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    if company is not None and trip.company_id != company.id:
        raise HTTPException(status_code=404, detail="Trip not found")

    print("Saving KM:", payload.start_km, payload.end_km)

    # Only update fields explicitly provided in request body (avoid overwriting with None).
    fields_set = getattr(payload, "model_fields_set", set()) or set()
    if "start_km" in fields_set:
        trip.start_km = payload.start_km
    if "end_km" in fields_set:
        trip.end_km = payload.end_km

    proposed_start = (
        payload.service_start_time if payload.service_start_time is not None else trip.service_start_time
    )
    proposed_end = (
        payload.service_end_time if payload.service_end_time is not None else trip.service_end_time
    )
    if proposed_start is not None and proposed_end is not None and proposed_end <= proposed_start:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    if payload.service_start_time is not None:
        trip.service_start_time = payload.service_start_time
    if payload.service_end_time is not None:
        trip.service_end_time = payload.service_end_time
    db.commit()
    db.refresh(trip)

    return (
        db.query(Trip)
        .options(joinedload(Trip.bookings), joinedload(Trip.driver), joinedload(Trip.vehicle))
        .filter(Trip.id == trip.id)
        .first()
    )


@router.post("/trips/{trip_id}/reset-service", response_model=TripWithContext)
def reset_trip_service(
    trip_id: int,
    db: Session = Depends(get_db),
    company=Depends(get_current_company),
    _auth: dict = Depends(require_trip_driver_or_admin),
) -> Trip:
    """
    Reset service data (times + KM) without deleting the trip.
    Intended for temporary operational fixes/testing.
    """
    trip = _get_trip_or_404(db, trip_id)
    if company is not None and trip.company_id != company.id:
        raise HTTPException(status_code=404, detail="Trip not found")

    trip.start_km = None
    trip.end_km = None
    trip.service_start_time = None
    trip.service_end_time = None
    db.commit()
    db.refresh(trip)

    manager.broadcast_sync(
        {"event": "trip_service_reset", "trip_id": trip.id, "status": trip.status.value}
    )

    return (
        db.query(Trip)
        .options(joinedload(Trip.bookings), joinedload(Trip.driver), joinedload(Trip.vehicle))
        .filter(Trip.id == trip.id)
        .first()
    )


@router.get("/trips/active", response_model=list[ActiveTripRow])
def list_active_trips(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[ActiveTripRow]:
    try:
        trips_q = (
            db.query(Trip)
            .options(joinedload(Trip.booking), joinedload(Trip.driver))
            .filter(Trip.status.in_(ACTIVE_DASHBOARD_STATUSES))
            .order_by(Trip.id.desc())
        )
        trips = trips_q.all()
        print("DISPATCH TRIPS COUNT:", len(trips))

        from app.services.dispatch_service import (
            compute_eta_to_pickup_minutes,
            resolve_pickup_lat_lng,
        )

        out: list[ActiveTripRow] = []
        for t in trips:
            b = t.booking
            pickup_lat, pickup_lng = resolve_pickup_lat_lng(t, b)
            destination_lat = (
                float(getattr(b, "dropoff_latitude", None) or getattr(b, "dropoff_lat", None))
                if b and (getattr(b, "dropoff_latitude", None) is not None or getattr(b, "dropoff_lat", None) is not None)
                else None
            )
            destination_lng = (
                float(getattr(b, "dropoff_longitude", None) or getattr(b, "dropoff_lng", None))
                if b and (getattr(b, "dropoff_longitude", None) is not None or getattr(b, "dropoff_lng", None) is not None)
                else None
            )

            eta_to_pickup: int | None = None
            if t.driver:
                eta_to_pickup = compute_eta_to_pickup_minutes(
                    t.driver.latitude,
                    t.driver.longitude,
                    pickup_lat,
                    pickup_lng,
                )
            # Temporary UI-testing fallback: force ETA if missing.
            if eta_to_pickup is None:
                eta_to_pickup = random.randint(5, 15)

            out.append(
                ActiveTripRow(
                    id=t.id,
                    status=(t.status.value if hasattr(t.status, "value") else str(t.status)),
                    driver=(t.driver.name if t.driver else None),
                    pickup=(
                        getattr(b, "pickup_address", None)
                        if b
                        else None
                    )
                    or (getattr(b, "pickup", None) if b else None),
                    destination=(
                        getattr(b, "dropoff_address", None)
                        if b
                        else None
                    )
                    or (getattr(b, "destination", None) if b else None),
                    eta=getattr(t, "eta", None),
                    pickup_lat=pickup_lat,
                    pickup_lng=pickup_lng,
                    destination_lat=destination_lat,
                    destination_lng=destination_lng,
                    eta_to_pickup_minutes=eta_to_pickup,
                    start_km=getattr(t, "start_km", None),
                    end_km=getattr(t, "end_km", None),
                    service_start_time=getattr(t, "service_start_time", None),
                    service_end_time=getattr(t, "service_end_time", None),
                )
            )
        return out
    except Exception as e:
        print("ERROR in /dispatch/trips/active:", str(e))
        raise e


@router.get("/drivers/available", response_model=list[DriverInfo])
def list_available_drivers(
    db: Session = Depends(get_db),
    company=Depends(get_current_company),
    _admin: dict = Depends(require_admin),
) -> list[Driver]:
    try:
        drivers = get_available_drivers(db)
        print("AVAILABLE DRIVERS:", [(d.id, getattr(d, "name", None), getattr(d, "is_active", None)) for d in drivers])
        return drivers
    except Exception as e:
        print("ERROR in drivers/available:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trips/{trip_id}/assign", response_model=TripWithContext)
def manual_assign_trip(
    trip_id: int,
    payload: ManualAssignRequest,
    db: Session = Depends(get_db),
    company=Depends(get_current_company),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    if company is not None and trip.company_id != company.id:
        raise HTTPException(status_code=404, detail="Trip not found")

    driver = db.query(Driver).filter(Driver.id == payload.driver_id).first()
    if driver is None:
        raise HTTPException(status_code=400, detail="Driver not found")
    if trip.company_id is not None and driver.company_id != trip.company_id:
        raise HTTPException(status_code=400, detail="Driver not in same company")

    vehicle = None
    if payload.vehicle_id is not None:
        vehicle = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
        if vehicle is None:
            raise HTTPException(status_code=400, detail="Vehicle not found")
        if trip.company_id is not None and vehicle.company_id != trip.company_id:
            raise HTTPException(status_code=400, detail="Vehicle not in same company")

    TripService.assign_driver(
        db=db,
        trip=trip,
        driver_id=payload.driver_id,
        vehicle_id=payload.vehicle_id,
    )
    return (
        db.query(Trip)
        .options(joinedload(Trip.bookings), joinedload(Trip.driver), joinedload(Trip.vehicle))
        .filter(Trip.id == trip.id)
        .first()
    )


@router.post("/trips/{trip_id}/reassign", response_model=TripWithContext)
def force_reassign_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    company=Depends(get_current_company),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    if company is not None and trip.company_id != company.id:
        raise HTTPException(status_code=404, detail="Trip not found")

    prev_driver_id = trip.driver_id
    trip.driver_id = None
    trip.vehicle_id = None
    trip.assigned_at = None
    trip.last_assigned_at = None
    db.commit()
    db.refresh(trip)

    # Previous assignment cleared => driver is available again.
    if prev_driver_id is not None:
        driver = db.query(Driver).filter(Driver.id == prev_driver_id).first()
        if driver is not None and getattr(driver, "status", None) != "available":
            driver.status = "available"
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

    # just clear assignment and return
    return (
        db.query(Trip)
        .options(joinedload(Trip.bookings), joinedload(Trip.driver), joinedload(Trip.vehicle))
        .filter(Trip.id == trip.id)
        .first()
    )


@router.post("/trips/{trip_id}/cancel", response_model=TripWithContext)
def cancel_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    company=Depends(get_current_company),
    _admin: dict = Depends(require_admin),
) -> Trip:
    trip = _get_trip_or_404(db, trip_id)
    if company is not None and trip.company_id != company.id:
        raise HTTPException(status_code=404, detail="Trip not found")

    prev_driver_id = trip.driver_id
    trip.status = TripStatus.CANCELLED
    trip.driver_id = None
    trip.vehicle_id = None
    trip.assigned_at = None
    trip.last_assigned_at = None

    db.commit()
    db.refresh(trip)

    # Trip cancelled => driver is available again.
    if prev_driver_id is not None:
        driver = db.query(Driver).filter(Driver.id == prev_driver_id).first()
        if driver is not None and getattr(driver, "status", None) != "available":
            driver.status = "available"
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

    return (
        db.query(Trip)
        .options(joinedload(Trip.bookings), joinedload(Trip.driver), joinedload(Trip.vehicle))
        .filter(Trip.id == trip.id)
        .first()
    )

