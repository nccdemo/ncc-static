from datetime import date as Date

from sqlalchemy.orm import Session, joinedload

from app.models.booking import Booking
from app.models.trip import Trip


def get_bookings(
    db: Session,
    *,
    company_id: int | None = None,
    date_from: Date | None = None,
    date_to: Date | None = None,
) -> list[Booking]:
    q = db.query(Booking).options(joinedload(Booking.trip).joinedload(Trip.driver))
    if company_id is not None:
        q = q.filter(Booking.company_id == int(company_id))
    if date_from is not None:
        q = q.filter(Booking.date >= date_from)
    if date_to is not None:
        q = q.filter(Booking.date <= date_to)
    return q.order_by(Booking.id.desc()).all()


def get_booking_by_id(db: Session, booking_id: int, *, company_id: int | None = None) -> Booking | None:
    q = db.query(Booking).filter(Booking.id == booking_id)
    if company_id is not None:
        q = q.filter(Booking.company_id == int(company_id))
    return q.first()
