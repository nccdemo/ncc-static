from sqlalchemy.orm import Session

from app.models.booking import Booking


def get_bookings(db: Session) -> list[Booking]:
    return db.query(Booking).all()


def get_booking_by_id(db: Session, booking_id: int) -> Booking | None:
    return db.query(Booking).filter(Booking.id == booking_id).first()
