from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.driver import Driver
from app.models.trip import Trip
from app.services.dispatch_service import resolve_pickup_lat_lng

router = APIRouter(prefix="/track", tags=["tracking"])


def _dropoff_lat_lng(trip: Trip, booking) -> tuple[float | None, float | None]:
    dlat = getattr(trip, "dropoff_lat", None) or getattr(trip, "destination_lat", None)
    dlng = getattr(trip, "dropoff_lng", None) or getattr(trip, "destination_lng", None)
    if booking is not None:
        if dlat is None:
            dlat = getattr(booking, "dropoff_latitude", None)
        if dlng is None:
            dlng = getattr(booking, "dropoff_longitude", None)
    if dlat is not None and dlng is not None:
        try:
            return float(dlat), float(dlng)
        except (TypeError, ValueError):
            return None, None
    return None, None


@router.get("/{token}")
def resolve_tracking_token(token: str, db: Session = Depends(get_db)) -> dict:
    """
    Public tracking by ``Trip.tracking_token`` (unauthenticated).

    Returns pickup / destination text and coordinates when known, plus live driver
    coordinates when a driver is assigned and has reported position.
    """
    trip = (
        db.query(Trip)
        .options(joinedload(Trip.booking))
        .filter(Trip.tracking_token == token)
        .first()
    )
    if trip is None:
        raise HTTPException(status_code=404, detail="Tracking not found")

    booking = trip.booking
    pickup_lat, pickup_lng = resolve_pickup_lat_lng(trip, booking)
    dest_lat, dest_lng = _dropoff_lat_lng(trip, booking)

    driver_lat: float | None = None
    driver_lng: float | None = None
    did = getattr(trip, "driver_id", None)
    if did is not None:
        driver = db.query(Driver).filter(Driver.id == int(did)).first()
        if driver is not None:
            la = getattr(driver, "latitude", None)
            lo = getattr(driver, "longitude", None)
            if la is not None and lo is not None:
                try:
                    driver_lat = float(la)
                    driver_lng = float(lo)
                except (TypeError, ValueError):
                    pass

    st = trip.status
    status_str = st.value if hasattr(st, "value") else str(st)

    return {
        "trip_id": trip.id,
        "status": status_str,
        "pickup": getattr(trip, "pickup", None),
        "destination": getattr(trip, "destination", None),
        "pickup_lat": pickup_lat,
        "pickup_lng": pickup_lng,
        "destination_lat": dest_lat,
        "destination_lng": dest_lng,
        "driver_id": did,
        "driver_lat": driver_lat,
        "driver_lng": driver_lng,
    }
