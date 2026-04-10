import os
import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_admin, require_ride_driver_or_admin
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.driver_wallet import DriverWallet, DriverWalletTransaction
from app.models.payment import Payment
from app.models.trip import Trip
from app.services.ride_commission import split_for_booking_and_trip
from app.services.stripe_service import CheckoutSessionCreationError, create_ride_payment_intent

router = APIRouter(prefix="/rides", tags=["rides"])


@router.get("/{ride_id}/payment-status")
def get_ride_payment_status(
    ride_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_ride_driver_or_admin),
) -> dict:
    payment = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .filter(Booking.trip_id == int(ride_id))
        .order_by(Payment.id.desc())
        .first()
    )
    if payment is None:
        return {"settled": False, "label": None, "status": "none"}

    st = str(payment.status or "").lower()
    if st == "refunded":
        return {"settled": False, "label": None, "status": "refunded"}
    if st == "cash_paid":
        return {"settled": True, "label": "Cash received", "status": "cash_paid"}
    if st == "paid":
        return {"settled": True, "label": "Paid", "status": "paid"}
    return {"settled": False, "label": None, "status": st}


@router.post("/{ride_id}/refund")
def refund_ride_payment(
    ride_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    payment = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .filter(Booking.trip_id == int(ride_id))
        .order_by(Payment.id.desc())
        .first()
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Idempotent: never crash if already refunded.
    if str(payment.status or "").lower() == "refunded":
        return {"status": "ok", "note": "already_refunded"}

    payment.ride_id = int(ride_id)
    payment.status = "refunded"
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"status": "ok"}


@router.post("/{ride_id}/cash")
def mark_ride_cash_paid(
    ride_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_ride_driver_or_admin),
) -> dict:
    booking = db.query(Booking).filter(Booking.trip_id == int(ride_id)).order_by(Booking.id.desc()).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Ride not found")

    trip = db.query(Trip).filter(Trip.id == int(ride_id)).first()
    driver_id = int(getattr(trip, "driver_id", 0) or 0) if trip is not None else 0
    if driver_id <= 0:
        raise HTTPException(status_code=400, detail="Ride has no driver assigned")

    payment = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .filter(Booking.trip_id == int(ride_id))
        .order_by(Payment.id.desc())
        .first()
    )

    gross, commission, driver_amt = split_for_booking_and_trip(
        booking=booking,
        trip=trip,
        gross_override=None,
    )

    if payment is None:
        payment = Payment(
            booking_id=int(booking.id),
            ride_id=int(ride_id),
            amount=gross,
            commission_amount=commission,
            driver_amount=driver_amt,
            status="cash_paid",
        )
        db.add(payment)
    else:
        if str(payment.status or "").lower() == "cash_paid":
            return {"status": "ok", "note": "already_cash_paid"}
        payment.ride_id = int(ride_id)
        payment.status = "cash_paid"
        payment.amount = gross
        payment.commission_amount = commission
        payment.driver_amount = driver_amt
        db.add(payment)

    wallet = db.query(DriverWallet).filter(DriverWallet.driver_id == driver_id).first()
    if wallet is None:
        wallet = DriverWallet(driver_id=driver_id, balance=0.0)
        db.add(wallet)
        db.flush()

    wallet.balance = float(getattr(wallet, "balance", 0.0) or 0.0) + float(commission)
    db.add(wallet)
    db.add(
        DriverWalletTransaction(
            driver_id=driver_id,
            ride_id=int(ride_id),
            amount=float(commission),
            type="cash_in",
            note=f"Cash commission ride #{ride_id}",
            wallet_id=getattr(wallet, "id", None),
        )
    )

    db.commit()
    db.refresh(payment)
    return {"status": "ok"}


@router.post("/{ride_id}/create-payment-intent")
def create_ride_payment_intent(
    ride_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_ride_driver_or_admin),
) -> dict:
    booking = (
        db.query(Booking)
        .filter(Booking.trip_id == int(ride_id))
        .order_by(Booking.id.desc())
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Ride not found")

    secret = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    stripe.api_key = secret

    trip = db.query(Trip).filter(Trip.id == int(ride_id)).first()
    connect_account: str | None = None
    fee_rate: float | None = None
    if trip is not None and trip.driver_id:
        driver = db.query(Driver).filter(Driver.id == int(trip.driver_id)).first()
        if driver is not None:
            acct = getattr(driver, "stripe_account_id", None)
            if acct and str(acct).strip():
                connect_account = str(acct).strip()
                fee_rate = float(getattr(trip, "commission_rate", 0.2) or 0.2)

    try:
        return create_ride_payment_intent(
            amount_eur=float(getattr(booking, "price", 0) or 0),
            ride_id=int(ride_id),
            booking_id=int(booking.id),
            bnb_id=getattr(booking, "bnb_id", None),
            referral_code=getattr(booking, "referral_code", None),
            connect_destination_account_id=connect_account,
            platform_fee_rate=fee_rate,
        )
    except CheckoutSessionCreationError as e:
        raise HTTPException(status_code=503, detail=getattr(e, "message", str(e))) from e


class ConfirmStripePaymentBody(BaseModel):
    payment_intent_id: str


@router.post("/{ride_id}/confirm-stripe-payment")
def confirm_stripe_payment_for_ride(
    ride_id: int,
    body: ConfirmStripePaymentBody,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_ride_driver_or_admin),
) -> dict:
    """
    Record a succeeded card payment in DB after the driver app confirms with Stripe.js.
    Idempotent by payment_intent id; complements the Stripe webhook (needed when webhooks
    are not reachable, e.g. local dev).
    """
    booking = (
        db.query(Booking)
        .filter(Booking.trip_id == int(ride_id))
        .order_by(Booking.id.desc())
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Ride not found")

    secret = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    stripe.api_key = secret

    pi_id = (body.payment_intent_id or "").strip()
    if not pi_id:
        raise HTTPException(status_code=400, detail="payment_intent_id required")

    try:
        intent = stripe.PaymentIntent.retrieve(pi_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payment intent: {e!s}") from e

    if intent.status != "succeeded":
        raise HTTPException(
            status_code=400,
            detail=f"PaymentIntent not succeeded (status={intent.status})",
        )

    md = dict(getattr(intent, "metadata", None) or {})
    md_ride = md.get("ride_id")
    md_booking = md.get("booking_id")
    if md_ride is not None and str(md_ride) != str(ride_id):
        raise HTTPException(status_code=400, detail="PaymentIntent does not match this ride")
    if md_booking is not None:
        try:
            if int(md_booking) != int(booking.id):
                raise HTTPException(status_code=400, detail="PaymentIntent does not match this booking")
        except HTTPException:
            raise
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Invalid booking metadata on PaymentIntent") from exc

    existing = db.query(Payment).filter(Payment.stripe_payment_intent == pi_id).first()
    if existing is not None:
        return {"status": "ok", "note": "already_recorded"}

    latest = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .filter(Booking.trip_id == int(ride_id))
        .order_by(Payment.id.desc())
        .first()
    )
    if latest is not None:
        st = str(latest.status or "").lower()
        if st in ("paid", "cash_paid"):
            raise HTTPException(status_code=409, detail="This ride is already marked as paid")

    amt_cents = getattr(intent, "amount_received", None) or getattr(intent, "amount", None) or 0
    try:
        amt = float(amt_cents) / 100.0
    except (TypeError, ValueError):
        amt = 0.0
    if amt <= 0:
        amt = float(getattr(booking, "price", 0) or 0)

    trip_row = db.query(Trip).filter(Trip.id == int(ride_id)).first()
    _, comm_c, drv_c = split_for_booking_and_trip(
        booking=booking,
        trip=trip_row,
        gross_override=amt,
    )

    booking.payment_intent_id = pi_id
    db.add(booking)
    db.add(
        Payment(
            booking_id=int(booking.id),
            ride_id=int(ride_id),
            amount=amt,
            commission_amount=comm_c,
            driver_amount=drv_c,
            status="paid",
            stripe_payment_intent=pi_id,
        )
    )
    db.commit()
    return {"status": "ok"}

