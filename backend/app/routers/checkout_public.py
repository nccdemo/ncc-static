"""Public read-only helpers after Stripe Checkout (no auth)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.tour import Tour
from app.models.trip import Trip

router = APIRouter(prefix="/public", tags=["public-checkout"])


@router.get("/checkout-success")
def get_booking_summary_after_checkout(
    session_id: str = Query(..., min_length=8, max_length=256, description="Stripe Checkout Session id (cs_…)"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Return a minimal booking + tracking payload for the post-payment success page.

    Looks up ``bookings.stripe_session_id`` (set when the tour checkout webhook completes).
    """
    sid = str(session_id).strip()
    booking = db.query(Booking).filter(Booking.stripe_session_id == sid).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found or payment still processing")

    tour_title: str | None = None
    if getattr(booking, "tour_id", None) is not None:
        tour = db.query(Tour).filter(Tour.id == int(booking.tour_id)).first()
        if tour is not None:
            tour_title = getattr(tour, "title", None)

    trip = None
    tid = getattr(booking, "trip_id", None)
    if tid is not None:
        trip = db.query(Trip).filter(Trip.id == int(tid)).first()

    tracking_token = (getattr(trip, "tracking_token", None) or "").strip() if trip is not None else None

    return {
        "booking_id": int(booking.id),
        "customer_name": getattr(booking, "customer_name", None),
        "email": getattr(booking, "email", None),
        "people": int(getattr(booking, "people", 1) or 1),
        "price": float(getattr(booking, "price", 0) or 0),
        "date": booking.date.isoformat() if getattr(booking, "date", None) is not None else None,
        "time": str(booking.time) if getattr(booking, "time", None) is not None else None,
        "status": str(getattr(booking, "status", "") or ""),
        "tour_title": tour_title,
        "trip_id": int(trip.id) if trip is not None else None,
        "tracking_token": tracking_token or None,
    }
