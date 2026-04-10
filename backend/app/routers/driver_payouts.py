from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_admin, require_admin_or_driver_self
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.driver_payout import DriverInvoice, DriverPayout
from app.models.payment import Payment
from app.models.trip import Trip
from app.services.driver_payout_service import (
    allocate_invoice_number,
    calculate_driver_payout,
    driver_has_pending_payout,
)

router = APIRouter(prefix="/drivers", tags=["driver-payouts"])


class ConfirmPayoutBody(BaseModel):
    payout_id: int = Field(gt=0)


def _payout_to_dict(p: DriverPayout) -> dict:
    return {
        "id": int(p.id),
        "driver_id": int(p.driver_id),
        "amount": float(p.amount or 0),
        "rides_count": int(p.rides_count or 0),
        "status": str(p.status or "").lower(),
        "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None,
        "paid_at": p.paid_at.isoformat() if getattr(p, "paid_at", None) else None,
    }


def _invoice_to_dict(inv: DriverInvoice) -> dict:
    return {
        "id": int(inv.id),
        "driver_id": int(inv.driver_id),
        "payout_id": int(inv.payout_id) if inv.payout_id is not None else None,
        "amount": float(inv.amount or 0),
        "date": inv.date.isoformat() if getattr(inv, "date", None) else None,
        "invoice_number": str(inv.invoice_number or ""),
    }


@router.get("/{driver_id}/payout-preview")
def preview_driver_payout(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    calc = calculate_driver_payout(db, driver_id)
    return {
        "total_payout_amount": calc["total_payout_amount"],
        "rides_count": calc["rides_count"],
    }


@router.post("/{driver_id}/generate-payout")
def generate_driver_payout(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    if driver_has_pending_payout(db, driver_id):
        raise HTTPException(
            status_code=400,
            detail="A pending payout already exists for this driver. Confirm it before creating another.",
        )

    calc = calculate_driver_payout(db, driver_id)
    total = float(calc["total_payout_amount"])
    trip_ids = calc["trip_ids"]
    if total <= 0 or not trip_ids:
        raise HTTPException(status_code=400, detail="No card payments available for payout")

    payout = DriverPayout(
        driver_id=int(driver_id),
        amount=total,
        rides_count=int(calc["rides_count"]),
        status="pending",
    )
    db.add(payout)
    db.flush()

    for tid in trip_ids:
        trip = db.query(Trip).filter(Trip.id == int(tid)).with_for_update().first()
        if trip is None:
            continue
        ps = getattr(trip, "payout_status", None)
        if ps is not None and str(ps).lower() != "none":
            db.rollback()
            raise HTTPException(status_code=409, detail="Payout eligibility changed; retry")
        trip.payout_status = "pending"
        trip.driver_payout_id = int(payout.id)
        db.add(trip)

    db.commit()
    db.refresh(payout)
    return {"status": "ok", "payout": _payout_to_dict(payout)}


@router.post("/{driver_id}/confirm-payout")
def confirm_driver_payout(
    driver_id: int,
    body: ConfirmPayoutBody,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    payout = (
        db.query(DriverPayout)
        .filter(
            DriverPayout.id == int(body.payout_id),
            DriverPayout.driver_id == int(driver_id),
        )
        .with_for_update()
        .first()
    )
    if payout is None:
        raise HTTPException(status_code=404, detail="Payout not found")
    if str(payout.status or "").lower() != "pending":
        raise HTTPException(status_code=400, detail="Payout is not pending")

    payout.status = "paid"
    payout.paid_at = datetime.utcnow()
    db.add(payout)

    db.query(Trip).filter(Trip.driver_payout_id == int(payout.id)).update(
        {Trip.payout_status: "paid"},
        synchronize_session=False,
    )

    inv_num = allocate_invoice_number(db)
    inv = DriverInvoice(
        driver_id=int(driver_id),
        payout_id=int(payout.id),
        amount=float(payout.amount or 0),
        date=date.today(),
        invoice_number=inv_num,
    )
    db.add(inv)
    db.commit()
    db.refresh(payout)
    db.refresh(inv)

    return {
        "status": "ok",
        "payout": _payout_to_dict(payout),
        "invoice": _invoice_to_dict(inv),
    }


@router.get("/{driver_id}/payouts")
def list_driver_payouts(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    rows = (
        db.query(DriverPayout)
        .filter(DriverPayout.driver_id == int(driver_id))
        .order_by(DriverPayout.created_at.desc())
        .all()
    )
    return {"items": [_payout_to_dict(p) for p in rows]}


@router.get("/{driver_id}/invoices")
def list_driver_invoices(
    driver_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    rows = (
        db.query(DriverInvoice)
        .filter(DriverInvoice.driver_id == int(driver_id))
        .order_by(DriverInvoice.date.desc(), DriverInvoice.id.desc())
        .all()
    )
    return {"items": [_invoice_to_dict(i) for i in rows]}


def _payment_method(p: Payment) -> str:
    st = str(p.status or "").lower()
    if st == "cash_paid":
        return "cash"
    if getattr(p, "stripe_payment_intent", None):
        return "card"
    return "other"


@router.get("/{driver_id}/payments")
def list_driver_payments(
    driver_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_admin_or_driver_self),
) -> dict[str, Any]:
    """Payments for rides linked to this driver (booking.driver_id or trip.driver_id)."""
    did = int(driver_id)
    driver = db.query(Driver).filter(Driver.id == did).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    rows = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .outerjoin(Trip, Booking.trip_id == Trip.id)
        .filter(
            or_(
                Booking.driver_id == did,
                Trip.driver_id == did,
            )
        )
        .order_by(Payment.created_at.desc())
        .all()
    )
    items: list[dict[str, Any]] = []
    for p in rows:
        created = p.created_at
        items.append(
            {
                "id": int(p.id),
                "booking_id": int(p.booking_id),
                "amount": float(p.amount or 0),
                "method": _payment_method(p),
                "date": created.isoformat() if created is not None else None,
                "status": str(p.status or ""),
            }
        )
    return {"items": items}


@router.get("/{driver_id}/payments-summary")
def driver_payments_summary(
    driver_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_admin_or_driver_self),
) -> dict:
    """Driver app: paid vs pending card payouts + totals."""
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    payouts = (
        db.query(DriverPayout)
        .filter(DriverPayout.driver_id == int(driver_id))
        .order_by(DriverPayout.created_at.desc())
        .all()
    )
    paid = [p for p in payouts if str(p.status or "").lower() == "paid"]
    pending = [p for p in payouts if str(p.status or "").lower() == "pending"]
    total_paid = sum(float(p.amount or 0) for p in paid)
    total_pending = sum(float(p.amount or 0) for p in pending)

    preview = calculate_driver_payout(db, driver_id)

    return {
        "paid_payouts": [_payout_to_dict(p) for p in paid],
        "pending_payouts": [_payout_to_dict(p) for p in pending],
        "total_earnings_paid": round(total_paid, 2),
        "total_pending_batch": round(total_pending, 2),
        "not_yet_batched_card_net": preview["total_payout_amount"],
        "preview_rides_count": preview["rides_count"],
        "invoices": [
            _invoice_to_dict(i)
            for i in (
                db.query(DriverInvoice)
                .filter(DriverInvoice.driver_id == int(driver_id))
                .order_by(DriverInvoice.date.desc())
                .all()
            )
        ],
    }
