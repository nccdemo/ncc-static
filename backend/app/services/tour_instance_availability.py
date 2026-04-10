"""Tour instance seat math for checkout + webhook (single source of truth)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.constants.booking_capacity import HELD_BOOKING_STATUSES
from app.models.booking import Booking
from app.models.tour_instance import TourInstance
from app.routers.tour_instances import compute_capacity_from_db

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def held_seats_for_instance(db: Session, instance_id: int) -> int:
    """Sum ``people`` for bookings that still consume inventory."""
    return int(
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(
            Booking.tour_instance_id == int(instance_id),
            Booking.status.in_(HELD_BOOKING_STATUSES),
        )
        .scalar()
        or 0
    )


def capacity_and_held(db: Session, instance_id: int) -> tuple[int, int]:
    """Return ``(capacity, held_seats)`` using the same rules as the public catalog."""
    cap = int(compute_capacity_from_db(db, int(instance_id)) or 0)
    held = held_seats_for_instance(db, instance_id)
    return cap, held


def seats_available(capacity: int, held: int) -> int:
    return max(0, int(capacity) - int(held))


def can_book_seats(capacity: int, held: int, seats_requested: int) -> bool:
    """False when there is no sellable inventory or the request exceeds what is left."""
    if int(seats_requested) < 1:
        return False
    if int(capacity) <= 0:
        return False
    return int(held) + int(seats_requested) <= int(capacity)


def log_overbooking_reject(
    *,
    phase: str,
    tour_instance_id: int,
    seats_requested: int,
    capacity: int,
    held: int,
    stripe_session_id: str | None = None,
) -> None:
    logger.error(
        "Overbooking rejected [%s] tour_instance_id=%s seats_requested=%s capacity=%s held=%s "
        "available=%s stripe_session_id=%s",
        phase,
        tour_instance_id,
        seats_requested,
        capacity,
        held,
        seats_available(capacity, held),
        stripe_session_id or "",
    )
