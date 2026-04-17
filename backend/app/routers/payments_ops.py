from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_admin
from app.models.booking import Booking
from app.models.payment import Payment
from app.services import stripe_service

router = APIRouter(prefix="/payments", tags=["payments-ops"])


@router.post("/{payment_id}/refund")
def refund_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    """
    Admin refund: Stripe ``Refund`` when ``stripe_payment_intent`` + ``paid``; else DB-only (cash / no PI).

    Updates linked booking to ``refunded`` when present.
    """
    payment = db.query(Payment).filter(Payment.id == int(payment_id)).first()
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    if str(payment.status or "").lower() == "refunded":
        return {"status": "ok", "note": "already_refunded"}

    st = str(payment.status or "").lower()
    if st == "pending":
        raise HTTPException(status_code=400, detail="Cannot refund a pending payment")

    booking = db.query(Booking).filter(Booking.id == int(payment.booking_id)).first()
    instance_id = (
        int(booking.tour_instance_id) if booking is not None and booking.tour_instance_id is not None else None
    )

    pi = (payment.stripe_payment_intent or "").strip() or None
    use_stripe = st == "paid" and pi is not None

    if use_stripe:
        if not stripe_service.stripe.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Stripe non configurato (manca STRIPE_SECRET_KEY)",
            )
        try:
            refund = stripe_service.stripe.Refund.create(payment_intent=pi)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Rimborso Stripe non riuscito: {e}",
            ) from e
        rid = getattr(refund, "id", None)
        payment.status = "refunded"
        if rid:
            payment.stripe_refund_id = str(rid)
        db.add(payment)
        if booking is not None:
            booking.status = "refunded"
            db.add(booking)
        db.commit()
        db.refresh(payment)
    else:
        payment.status = "refunded"
        db.add(payment)
        if booking is not None:
            booking.status = "refunded"
            db.add(booking)
        db.commit()
        db.refresh(payment)

    if instance_id is not None:
        try:
            from app.routers.bookings import _broadcast_instance_capacity

            _broadcast_instance_capacity(db, instance_id)
        except Exception:
            pass

    return {
        "status": "ok",
        "payment_id": int(payment.id),
        "refunded_via_stripe": bool(use_stripe),
    }
