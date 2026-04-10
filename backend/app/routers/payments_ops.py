from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.payment import Payment

router = APIRouter(prefix="/payments", tags=["payments-ops"])


@router.post("/{payment_id}/refund")
def refund_payment(payment_id: int, db: Session = Depends(get_db)) -> dict:
    payment = db.query(Payment).filter(Payment.id == int(payment_id)).first()
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Idempotent: if already refunded, do nothing.
    if str(payment.status or "").lower() == "refunded":
        return {"status": "ok", "note": "already_refunded"}

    payment.status = "refunded"
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"status": "ok"}

