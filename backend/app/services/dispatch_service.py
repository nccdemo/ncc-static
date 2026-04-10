from datetime import datetime, timedelta
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.driver import Driver
from app.models.trip import Trip, TripStatus
from app.models.vehicle import Vehicle


ACTIVE_TRIP_STATUSES: tuple[TripStatus, ...] = (
    TripStatus.ASSIGNED,
    TripStatus.ACCEPTED,
    TripStatus.EN_ROUTE,
    TripStatus.ARRIVED,
    TripStatus.IN_PROGRESS,
)


def auto_assign_driver(db: Session, trip: Trip) -> Trip:
    """
    Assign the first available active driver to the given trip.
    A driver is considered unavailable if they are assigned to another active trip.
    Vehicle selection is simple for now:
      - use trip.vehicle_id if already present
      - otherwise pick the first active vehicle
    """
    assigned_driver_ids_stmt = (
        select(Trip.driver_id)
        .where(
            Trip.driver_id.is_not(None),
            Trip.status.in_(ACTIVE_TRIP_STATUSES),
        )
        .distinct()
    )

    driver = (
        db.query(Driver)
        .filter(
            Driver.is_active.is_(True),
            Driver.id.notin_(assigned_driver_ids_stmt),
        )
        .order_by(Driver.id.asc())
        .first()
    )
    if driver is None:
        return trip

    if trip.vehicle_id is not None:
        vehicle_id = trip.vehicle_id
    else:
        vehicle = (
            db.query(Vehicle)
            .filter(Vehicle.active.is_(True))
            .order_by(Vehicle.id.asc())
            .first()
        )
        vehicle_id = vehicle.id if vehicle is not None else None

    from app.services.trip_service import TripService

    return TripService.assign_driver(
        db=db,
        trip=trip,
        driver_id=driver.id,
        vehicle_id=vehicle_id,
    )


def get_available_drivers(db: Session) -> list[Driver]:
    return (
        db.query(Driver)
        .filter(Driver.is_active.is_(True))
        .order_by(Driver.id.asc())
        .all()
    )


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Distance between two points on Earth in kilometers.
    """
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def estimate_eta_km(distance_km: float) -> int:
    """
    Simple ETA estimation in minutes.
    Avg speed = 40 km/h. Formula: (distance_km / 40) * 60, rounded to int.
    """
    if distance_km <= 0:
        return 0
    eta_minutes = (distance_km / 40.0) * 60.0
    return int(round(eta_minutes))


def resolve_pickup_lat_lng(
    trip: object | None,
    booking: object | None,
) -> tuple[float | None, float | None]:
    """
    Pickup coordinates for ETA: prefer trip-level attrs (if present), then booking.
    Works without extra DB columns on Trip via getattr (optional hybrid / future columns).
    """
    if trip is not None:
        plat = getattr(trip, "pickup_lat", None) or getattr(trip, "pickup_latitude", None)
        plng = getattr(trip, "pickup_lng", None) or getattr(trip, "pickup_longitude", None)
        if plat is not None and plng is not None:
            return float(plat), float(plng)
    if booking is not None:
        plat = getattr(booking, "pickup_latitude", None) or getattr(booking, "pickup_lat", None)
        plng = getattr(booking, "pickup_longitude", None) or getattr(booking, "pickup_lng", None)
        if plat is not None and plng is not None:
            return float(plat), float(plng)
    return None, None


def resolve_pickup_lat_lng_for_trip(
    trip: object | None,
    bookings: list | None,
) -> tuple[float | None, float | None]:
    """Trip coords first, then first booking in the list that has pickup lat/lng."""
    plat, plng = resolve_pickup_lat_lng(trip, None)
    if plat is not None and plng is not None:
        return plat, plng
    for b in bookings or []:
        plat, plng = resolve_pickup_lat_lng(None, b)
        if plat is not None and plng is not None:
            return plat, plng
    return None, None


def compute_eta_to_pickup_minutes(
    driver_lat: float | None,
    driver_lng: float | None,
    pickup_lat: float | None,
    pickup_lng: float | None,
) -> int | None:
    """
    Whole minutes from driver position to pickup at 40 km/h average.
    None if any coordinate is missing.
    """
    if (
        driver_lat is None
        or driver_lng is None
        or pickup_lat is None
        or pickup_lng is None
    ):
        return None
    dist_km = haversine_distance(
        float(driver_lat),
        float(driver_lng),
        float(pickup_lat),
        float(pickup_lng),
    )
    return estimate_eta_km(dist_km)


# Simple in-process memory of drivers tried per trip.
# This avoids re-assigning the same driver repeatedly without needing Redis yet.
_TRIED_DRIVERS_BY_TRIP: dict[int, set[int]] = {}


def auto_assign_next_driver(db: Session, trip: Trip) -> Trip:
    now = datetime.utcnow()

    drivers = get_available_drivers(db)
    tried = _TRIED_DRIVERS_BY_TRIP.setdefault(trip.id, set())

    # If currently assigned, consider that driver "tried"
    if trip.driver_id is not None:
        tried.add(trip.driver_id)

    # Attempt nearest-driver selection if we have pickup coords and driver coords.
    booking = getattr(trip, "booking", None)
    pickup_lat, pickup_lng = resolve_pickup_lat_lng(trip, booking)

    drivers_not_tried = [d for d in drivers if d.id not in tried]

    driver = None
    if (
        pickup_lat is not None
        and pickup_lng is not None
        and any(
            d.latitude is not None and d.longitude is not None for d in drivers_not_tried
        )
    ):
        scored: list[tuple[float, Driver]] = []
        for d in drivers_not_tried:
            if d.latitude is None or d.longitude is None:
                continue
            dist_km = haversine_distance(
                float(pickup_lat),
                float(pickup_lng),
                float(d.latitude),
                float(d.longitude),
            )
            scored.append((dist_km, d))
        scored.sort(key=lambda x: x[0])
        if scored:
            driver = scored[0][1]

    # Fallback: first available (by id) if no geo selection possible.
    if driver is None:
        driver = next(iter(drivers_not_tried), None)
    if driver is None:
        return trip

    # Vehicle selection: keep existing vehicle if present, else pick first active.
    if trip.vehicle_id is not None:
        vehicle_id = trip.vehicle_id
    else:
        vehicle_query = db.query(Vehicle).filter(Vehicle.active.is_(True))
        vehicle = vehicle_query.order_by(Vehicle.id.asc()).first()
        vehicle_id = vehicle.id if vehicle is not None else None

    trip.assignment_attempts = (trip.assignment_attempts or 0) + 1
    trip.last_assigned_at = now

    from app.services.trip_service import TripService

    return TripService.assign_driver(
        db=db,
        trip=trip,
        driver_id=driver.id,
        vehicle_id=vehicle_id,
    )


def check_assignment_timeouts(db: Session, timeout_seconds: int = 30) -> int:
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=timeout_seconds)

    timed_out_trips = (
        db.query(Trip)
        .filter(
            Trip.status == TripStatus.ASSIGNED,
            Trip.last_assigned_at.is_not(None),
            Trip.last_assigned_at < cutoff,
        )
        .all()
    )

    processed = 0
    for trip in timed_out_trips:
        # Mark current driver as tried, clear assignment, and try next.
        tried = _TRIED_DRIVERS_BY_TRIP.setdefault(trip.id, set())
        if trip.driver_id is not None:
            tried.add(trip.driver_id)

        trip.driver_id = None
        trip.vehicle_id = None
        trip.assigned_at = None
        db.commit()
        db.refresh(trip)
        processed += 1

    return processed
