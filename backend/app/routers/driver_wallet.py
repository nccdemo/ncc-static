from datetime import datetime, timedelta, timezone

import pytz
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_admin
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.driver_wallet import DriverWallet, DriverWalletTransaction
from app.models.payment import Payment
from app.models.trip import Trip, TripStatus
from app.services.ride_commission import resolve_payment_split

router = APIRouter(
    prefix="/drivers",
    tags=["driver-wallet"],
    dependencies=[Depends(require_admin)],
)


class SettleWalletBody(BaseModel):
    amount_received: float


class PayoutBody(BaseModel):
    amount: float = Field(gt=0, description="Amount to pay out (reduces wallet obligation)")


def _rome_start_of_today_utc_naive() -> datetime:
    """
    Start of the current calendar day in Europe/Rome, as naive UTC for SQLAlchemy
    comparison with Payment.created_at (stored as wall-clock UTC in practice).
    """
    tz = pytz.timezone("Europe/Rome")
    now = datetime.now(tz)
    d = now.date()
    start_of_day = tz.localize(datetime(d.year, d.month, d.day, 0, 0, 0))
    return start_of_day.astimezone(pytz.UTC).replace(tzinfo=None)


def _driver_earnings_aggregate(
    db: Session,
    driver_id: int,
    since: datetime | None = None,
) -> tuple[float, float, float]:
    """Sums (gross, commission_paid, driver_net) for payments on this driver's trips (non-refunded)."""
    q = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .join(Trip, Trip.id == Booking.trip_id)
        .filter(Trip.driver_id == int(driver_id))
        .filter(func.lower(Payment.status) != "refunded")
    )
    if since is not None:
        q = q.filter(Payment.created_at >= since)
    gross_t = commission_t = driver_t = 0.0
    for p in q.all():
        g, c, d = resolve_payment_split(db, p)
        gross_t += g
        commission_t += c
        driver_t += d
    return gross_t, commission_t, driver_t


@router.get("/{driver_id}/report")
def get_driver_financial_report(driver_id: int, db: Session = Depends(get_db)) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    today_start = _rome_start_of_today_utc_naive()
    gross_earnings, commission_paid, driver_net = _driver_earnings_aggregate(db, driver_id, since=None)
    tg, tc, td = _driver_earnings_aggregate(db, driver_id, since=today_start)

    total_rides = (
        db.query(func.count(Trip.id))
        .filter(Trip.driver_id == int(driver_id), Trip.status == TripStatus.COMPLETED)
        .scalar()
        or 0
    )

    wallet = db.query(DriverWallet).filter(DriverWallet.driver_id == int(driver_id)).first()
    wallet_balance = float(getattr(wallet, "balance", 0.0) or 0.0) if wallet is not None else 0.0

    return {
        "gross_earnings": gross_earnings,
        "commission_paid": commission_paid,
        "driver_net": driver_net,
        "wallet_balance": wallet_balance,
        "total_rides": int(total_rides),
        "today_gross_earnings": tg,
        "today_commission_paid": tc,
        "today_driver_net": td,
        "today_earnings": tg,
    }


@router.get("/{driver_id}/wallet")
def get_driver_wallet(driver_id: int, db: Session = Depends(get_db)) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    wallet = db.query(DriverWallet).filter(DriverWallet.driver_id == int(driver_id)).first()
    if wallet is None:
        wallet = DriverWallet(driver_id=int(driver_id), balance=0.0)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)

    txs = (
        db.query(DriverWalletTransaction)
        .filter(DriverWalletTransaction.driver_id == int(driver_id))
        .order_by(DriverWalletTransaction.created_at.desc())
        .all()
    )

    return {
        "balance": float(getattr(wallet, "balance", 0.0) or 0.0),
        "transactions": [
            {
                "id": int(t.id),
                "ride_id": int(t.ride_id) if getattr(t, "ride_id", None) is not None else None,
                "amount": float(t.amount or 0.0),
                "type": str(t.type or ""),
                "note": str(getattr(t, "note", None) or "").strip(),
                "created_at": t.created_at.isoformat() if getattr(t, "created_at", None) else None,
            }
            for t in txs
        ],
    }


@router.post("/{driver_id}/settle-wallet")
def settle_wallet(driver_id: int, payload: SettleWalletBody, db: Session = Depends(get_db)) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    wallet = db.query(DriverWallet).filter(DriverWallet.driver_id == int(driver_id)).first()
    if wallet is None:
        wallet = DriverWallet(driver_id=int(driver_id), balance=0.0)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)

    balance = float(getattr(wallet, "balance", 0.0) or 0.0)
    if balance <= 0:
        return {"status": "ok", "note": "nothing_to_settle", "balance": 0.0}

    amount_received = float(payload.amount_received or 0.0)
    if amount_received <= 0:
        return {"status": "ok", "note": "invalid_amount", "balance": balance}

    applied = min(amount_received, balance)
    wallet.balance = max(0.0, balance - applied)
    db.add(wallet)
    db.add(
        DriverWalletTransaction(
            driver_id=int(driver_id),
            ride_id=None,
            amount=-float(applied),
            type="settlement",
            note="Wallet settlement",
            wallet_id=getattr(wallet, "id", None),
        )
    )
    db.commit()
    db.refresh(wallet)
    return {"status": "ok", "balance": float(wallet.balance or 0.0)}


@router.post("/{driver_id}/payout")
def driver_payout(
    driver_id: int,
    payload: PayoutBody,
    db: Session = Depends(get_db),
) -> dict:
    """
    Record a payout to the driver: reduces wallet balance (money they owed from cash collected).
    Full accounting: transaction type 'payout' with negative amount. Balance cannot go below zero.
    """
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    wallet = db.query(DriverWallet).filter(DriverWallet.driver_id == int(driver_id)).first()
    if wallet is None:
        wallet = DriverWallet(driver_id=int(driver_id), balance=0.0)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)

    balance = float(getattr(wallet, "balance", 0.0) or 0.0)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="Wallet balance is already zero")

    amount = float(payload.amount)
    if amount > balance + 1e-6:
        raise HTTPException(
            status_code=400,
            detail=f"Amount exceeds wallet balance (balance €{balance:.2f})",
        )

    last_tx = (
        db.query(DriverWalletTransaction)
        .filter(DriverWalletTransaction.driver_id == int(driver_id))
        .order_by(DriverWalletTransaction.created_at.desc(), DriverWalletTransaction.id.desc())
        .first()
    )
    if last_tx is not None and str(last_tx.type or "").lower() == "payout":
        ct = getattr(last_tx, "created_at", None)
        if ct is not None:
            now = datetime.now(timezone.utc)
            if ct.tzinfo is None:
                ct_utc = ct.replace(tzinfo=timezone.utc)
            else:
                ct_utc = ct.astimezone(timezone.utc)
            if now - ct_utc < timedelta(seconds=10):
                raise HTTPException(
                    status_code=429,
                    detail="A payout was just processed. Wait before retrying.",
                )

    wallet.balance = max(0.0, balance - amount)
    db.add(wallet)
    db.add(
        DriverWalletTransaction(
            driver_id=int(driver_id),
            ride_id=None,
            amount=-float(amount),
            type="payout",
            note="Driver payout",
            wallet_id=getattr(wallet, "id", None),
        )
    )
    db.commit()
    db.refresh(wallet)
    return {"status": "ok", "balance": float(wallet.balance or 0.0), "payout_amount": float(amount)}

