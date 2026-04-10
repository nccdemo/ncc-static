from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.quote import Quote
from app.models.trip import Trip
from app.services.trip_service import TripService


def fulfill_quote_to_booking_and_trip(
    db: Session,
    quote: Quote,
    stripe_session_id: str | None,
) -> tuple[Booking, Trip]:
    """Create confirmed Booking + Trip from a quote. Caller must hold quote FOR UPDATE."""
    booking = Booking(
        company_id=getattr(quote, "company_id", None),
        tour_id=None,
        tour_instance_id=None,
        customer_name=quote.customer_name,
        email=quote.email,
        phone=quote.phone,
        date=quote.date,
        time=quote.time,
        people=int(quote.people),
        price=float(quote.price),
        status="confirmed",
        pickup=quote.pickup,
        destination=quote.destination,
        flight_number=getattr(quote, "flight_number", None),
        stripe_session_id=stripe_session_id,
    )
    db.add(booking)
    db.flush()
    quote.booking_id = booking.id
    quote.status = "confirmed"
    quote.stripe_session_id = stripe_session_id
    trip = TripService.create_from_booking(db=db, booking=booking, send_customer_notification=False)
    db.refresh(quote)
    db.refresh(booking)
    return booking, trip
