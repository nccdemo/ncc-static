"""
Card-ride driver payouts: only Payment.status == paid (Stripe), never cash_paid.
Trips use payout_status none -> pending -> paid to prevent double payout.
"""

from __future__ import annotations

from datetime import date
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.driver_payout import DriverInvoice, DriverPayout
from app.models.payment import Payment
from app.models.trip import Trip
from app.services.ride_commission import resolve_payment_split


def _eligible_trip_ids_for_card_payout(db: Session, driver_id: int) -> list[int]:
    rows = (
        db.query(Trip.id)
        .join(Booking, Booking.trip_id == Trip.id)
        .join(Payment, Payment.booking_id == Booking.id)
        .filter(Trip.driver_id == int(driver_id))
        .filter(func.lower(Payment.status) == "paid")
        .filter(
            or_(
                Trip.payout_status.is_(None),
                func.lower(Trip.payout_status) == "none",
            )
        )
        .distinct()
        .all()
    )
    return [int(r[0]) for r in rows]


def calculate_driver_payout(db: Session, driver_id: int) -> dict:
    trip_ids = _eligible_trip_ids_for_card_payout(db, driver_id)
    total = 0.0
    count = 0
    for tid in trip_ids:
        payment = (
            db.query(Payment)
            .join(Booking, Payment.booking_id == Booking.id)
            .filter(Booking.trip_id == int(tid))
            .filter(func.lower(Payment.status) == "paid")
            .order_by(Payment.id.desc())
            .first()
        )
        if payment is None:
            continue
        _, _, driver_amt = resolve_payment_split(db, payment)
        total += float(driver_amt)
        count += 1
    return {
        "total_payout_amount": round(total, 2),
        "rides_count": int(count),
        "trip_ids": trip_ids,
    }


def allocate_invoice_number(db: Session) -> str:
    year = date.today().year
    prefix = f"INV-{year}-"
    rows = db.query(DriverInvoice.invoice_number).filter(DriverInvoice.invoice_number.like(f"{prefix}%")).all()
    max_seq = 0
    for (num,) in rows:
        try:
            seq = int(str(num).split("-")[-1])
            max_seq = max(max_seq, seq)
        except (ValueError, IndexError):
            pass
    return f"{prefix}{max_seq + 1:04d}"


def driver_has_pending_payout(db: Session, driver_id: int) -> bool:
    return (
        db.query(DriverPayout)
        .filter(
            DriverPayout.driver_id == int(driver_id),
            func.lower(DriverPayout.status) == "pending",
        )
        .first()
        is not None
    )
