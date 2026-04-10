from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from app.database import get_db
from app.models.trip import Trip

router = APIRouter(prefix="/track", tags=["tracking"])


@router.get("/{token}")
def resolve_tracking_token(token: str, db: Session = Depends(get_db)) -> dict:
    """
    Resolve a public tracking token to trip + coordinates.
    Token must be random/unpredictable (UUID stored on Trip.tracking_token).
    """
    trip = db.query(Trip).filter(Trip.tracking_token == token).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Tracking not found")

    return {
        "trip_id": trip.id,
        "pickup": getattr(trip, "pickup", None),
        "destination": getattr(trip, "destination", None),
        "pickup_lat": getattr(trip, "pickup_lat", None),
        "pickup_lng": getattr(trip, "pickup_lng", None),
        "destination_lat": getattr(trip, "destination_lat", None),
        "destination_lng": getattr(trip, "destination_lng", None),
        "driver_id": getattr(trip, "driver_id", None),
    }

