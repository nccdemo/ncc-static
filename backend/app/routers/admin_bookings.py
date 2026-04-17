from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.deps.auth import get_actor_context
from app.models.bnb_earning import BnbEarning
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.quote import Quote
from app.models.service_log import ServiceLog
from app.routers.bookings import _broadcast_instance_capacity

router = APIRouter(prefix="/admin/bookings", tags=["admin-bookings"])


@router.delete("/{booking_id}")
def admin_delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    actor: dict = Depends(get_actor_context),
) -> dict:
    """
    Hard-delete a booking and its dependent records.

    RBAC:
    - admin: delete any booking
    - company (driver): only bookings with matching ``company_id``

    Not found: 404.
    """
    instance_id: int | None = None
    try:
        booking = db.query(Booking).filter(Booking.id == int(booking_id)).first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")

        if actor["role"] != "admin":
            if getattr(booking, "company_id", None) != int(actor["company_id"]):
                raise HTTPException(status_code=403, detail="Forbidden")

        instance_id = (
            int(getattr(booking, "tour_instance_id", None))
            if getattr(booking, "tour_instance_id", None) is not None
            else None
        )

        # Detach quotes (nullable FK) so we can delete booking.
        db.query(Quote).filter(Quote.booking_id == booking.id).update(
            {Quote.booking_id: None}, synchronize_session=False
        )

        # Delete dependent rows referencing booking_id (non-nullable FKs).
        db.query(ServiceLog).filter(ServiceLog.booking_id == booking.id).delete(
            synchronize_session=False
        )
        db.query(BnbEarning).filter(BnbEarning.booking_id == booking.id).delete(
            synchronize_session=False
        )
        db.query(Payment).filter(Payment.booking_id == booking.id).delete(
            synchronize_session=False
        )

        db.delete(booking)
        db.commit()
    except HTTPException:
        # Preserve FastAPI error semantics; ensure session is clean for middleware/other handlers.
        db.rollback()
        raise
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while deleting booking") from e

    if instance_id is not None:
        _broadcast_instance_capacity(db, instance_id)

    return {"success": True}

