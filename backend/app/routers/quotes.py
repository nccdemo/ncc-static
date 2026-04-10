from datetime import date as Date, time as Time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.quote import Quote
from app.services.email_service import send_trip_confirmed_email
from app.services.quote_service import fulfill_quote_to_booking_and_trip

router = APIRouter(prefix="/quotes", tags=["quotes"])


class QuoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    customer_name: str
    email: str
    phone: str
    pickup: str
    destination: str
    date: Date
    time: Time
    people: int
    price: float
    flight_number: str | None = None
    booking_id: int | None = None


class QuoteUpdate(BaseModel):
    customer_name: str | None = None
    passenger_name: str | None = None
    phone: str | None = None
    people: int | None = None
    date: Date | None = None
    time: Time | None = None
    pickup: str | None = None
    destination: str | None = None
    flight_number: str | None = None


@router.get("/{quote_id}", response_model=QuoteResponse)
def get_quote(quote_id: int, db: Session = Depends(get_db)) -> Quote:
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if q is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    return q


@router.patch("/{quote_id}", response_model=QuoteResponse)
def update_quote(
    quote_id: int,
    payload: QuoteUpdate,
    db: Session = Depends(get_db),
) -> Quote:
    q = db.query(Quote).filter(Quote.id == quote_id).with_for_update().first()
    if q is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    if str(getattr(q, "status", "") or "").lower() != "pending":
        raise HTTPException(status_code=400, detail="Quote is no longer editable")

    if payload.passenger_name is not None and payload.customer_name is None:
        payload.customer_name = payload.passenger_name

    if payload.customer_name is not None:
        q.customer_name = payload.customer_name.strip() or q.customer_name
    if payload.phone is not None:
        q.phone = payload.phone.strip() or q.phone
    if payload.people is not None:
        if int(payload.people) < 1:
            raise HTTPException(status_code=400, detail="people must be >= 1")
        q.people = int(payload.people)
    if payload.date is not None:
        q.date = payload.date
    if payload.time is not None:
        q.time = payload.time
    if payload.pickup is not None:
        q.pickup = payload.pickup.strip() or q.pickup
    if payload.destination is not None:
        q.destination = payload.destination.strip() or q.destination
    if payload.flight_number is not None:
        q.flight_number = payload.flight_number.strip() or None

    db.commit()
    db.refresh(q)
    return q


@router.post("/{quote_id}/pay", status_code=status.HTTP_200_OK)
def simulate_pay_quote(quote_id: int, db: Session = Depends(get_db)) -> dict:
    """Dev / admin: mark quote paid without Stripe (same outcome as webhook)."""
    import threading
    import uuid

    q = db.query(Quote).filter(Quote.id == quote_id).with_for_update().first()
    if q is None:
        raise HTTPException(status_code=404, detail="Quote not found")
    st = str(getattr(q, "status", "") or "").lower()
    if st == "confirmed":
        raise HTTPException(status_code=400, detail="Quote already confirmed")
    if st != "pending":
        raise HTTPException(status_code=400, detail="Quote cannot be paid in this state")

    sid = f"sim_{uuid.uuid4().hex}"

    booking, trip = fulfill_quote_to_booking_and_trip(db, q, stripe_session_id=sid)

    try:
        threading.Thread(
            target=send_trip_confirmed_email,
            kwargs={"to_email": booking.email, "booking": booking, "trip": trip},
            daemon=True,
        ).start()
    except Exception:
        pass

    return {
        "success": True,
        "quote_id": q.id,
        "booking_id": booking.id,
        "trip_id": trip.id,
    }
