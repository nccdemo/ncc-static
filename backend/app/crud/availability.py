from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.availability import Availability
from app.models.vehicle import Vehicle
from app.schemas.availability import AvailabilityCreate


def get_availabilities(db: Session) -> list[Availability]:
    return db.query(Availability).all()


def get_availability_by_vehicle_and_date(
    db: Session,
    vehicle_id: int,
    date: date,
) -> Availability | None:
    return (
        db.query(Availability)
        .filter(Availability.vehicle_id == vehicle_id, Availability.date == date)
        .first()
    )


def get_availability_by_vehicle_and_date_for_update(
    db: Session,
    vehicle_id: int,
    booking_date: date,
) -> Availability | None:
    return (
        db.query(Availability)
        .filter(Availability.vehicle_id == vehicle_id, Availability.date == booking_date)
        .with_for_update()
        .first()
    )


def get_available_vehicle_for_people(
    db: Session,
    people: int,
    date: date,
) -> Availability | None:
    """
    Returns the first lock-acquired availability row with enough remaining slots.
    This enables safe automatic vehicle assignment under concurrent bookings.
    """
    return (
        db.query(Availability)
        .join(Vehicle, Vehicle.id == Availability.vehicle_id)
        .filter(
            Vehicle.active.is_(True),
            Availability.date == date,
            (Availability.total_slots - Availability.booked_slots) >= people,
        )
        .order_by(
            (Availability.total_slots - Availability.booked_slots).asc(),
            Availability.id.asc(),
        )
        .with_for_update(skip_locked=True)
        .first()
    )


def get_calendar_availability(db: Session, start_date: date, end_date: date) -> list[dict]:
    rows = (
        db.query(
            Availability.date.label("date"),
            func.sum(Availability.total_slots - Availability.booked_slots).label(
                "available_slots"
            ),
        )
        .filter(Availability.date >= start_date, Availability.date <= end_date)
        .group_by(Availability.date)
        .order_by(Availability.date.asc())
        .all()
    )

    return [
        {
            "date": row.date,
            "available_slots": int(row.available_slots or 0),
            "status": "available" if int(row.available_slots or 0) > 0 else "full",
        }
        for row in rows
    ]


def create_availability(db: Session, payload: AvailabilityCreate) -> Availability:
    availability = Availability(**payload.dict())
    db.add(availability)
    db.commit()
    db.refresh(availability)
    return availability
