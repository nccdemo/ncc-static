import json
import logging
import os
import threading
from datetime import date as Date
from typing import Annotated

from pydantic import BaseModel, field_validator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.quote import Quote
from app.models.stripe_webhook_event import StripeWebhookEvent
from app.models.payment import Payment
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.models.trip import Trip
from app.routers.tour_instances import _instance_blocks_new_bookings
from app.services.email_service import (
    send_confirmation_email,
    send_trip_confirmed_email,
)
from app.services.quote_service import fulfill_quote_to_booking_and_trip
from app.services.referral_booking import (
    increment_provider_bnb_earnings,
    resolve_valid_bnb_referral,
)
from app.services.ride_commission import split_for_booking_and_trip
from app.services.bnb_commission_transfer import apply_bnb_commission_for_payment_intent
from app.services.checkout_balance_transfers import run_post_checkout_balance_transfers
import stripe

from app.services.payment_ledger import (
    checkout_metadata_has_bnb_id,
    marketplace_checkout_split_eur,
)
from app.services.stripe_service import (
    CheckoutSessionCreationError,
    create_checkout_session,
    create_pending_booking_checkout_session,
    create_pending_quote_checkout_session,
    create_simple_checkout_session,
    create_tour_checkout_session,
)
from app.schemas.tour_booking_checkout import TourBookingCheckoutCreate
from app.services.stripe_checkout_session_completed import (
    fulfill_tour_instance_checkout_session,
    normalize_tour_checkout_metadata,
)
from app.services.tour_instance_availability import (
    can_book_seats,
    capacity_and_held,
    log_overbooking_reject,
)
from app.services.tour_stripe_booking import create_tour_booking_checkout
from app.services.trip_service import TripService
from app.utils.referral_from_host import get_referral_from_host

router = APIRouter(tags=["payments"])
logger = logging.getLogger(__name__)


def _stripe_event_already_processed(db: Session, event_id: str) -> bool:
    return (
        db.query(StripeWebhookEvent)
        .filter(StripeWebhookEvent.event_id == event_id)
        .first()
        is not None
    )


def _stripe_event_mark_done(db: Session, event_id: str) -> None:
    """Persist event id after successful handling (idempotent insert)."""
    try:
        db.add(StripeWebhookEvent(event_id=event_id))
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.debug("Stripe event %s already recorded (concurrent delivery)", event_id)


def _stripe_checkout_response_should_record(resp: JSONResponse) -> bool:
    """Whether this 200 response means checkout handling is complete (do not retry)."""
    if resp.status_code != 200:
        return False
    try:
        raw = resp.body
        if isinstance(raw, memoryview):
            raw = raw.tobytes()
        body = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
    except Exception:
        return False
    st = body.get("status")
    # Do not record "ignored" so unknown-metadata events are not permanently skipped if replayed.
    return st in ("ok", "success")


def get_payment_by_session(db: Session, stripe_session_id: str | None) -> Payment | None:
    """Idempotency: one payment row per Stripe Checkout Session ``cs_…``."""
    sid = (str(stripe_session_id).strip() if stripe_session_id else "") or ""
    if not sid:
        return None
    return db.query(Payment).filter(Payment.stripe_session_id == sid).first()


def _metadata_positive_int(metadata: dict, key: str) -> int | None:
    v = metadata.get(key) if metadata else None
    if v is None or str(v).strip() == "":
        return None
    try:
        n = int(v)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _coerce_optional_fk(val: object) -> int | None:
    if val is None:
        return None
    try:
        n = int(val)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def insert_payment(db: Session, data: dict) -> Payment:
    """
    Insert a Checkout-linked payment. ``total_amount`` is gross EUR (maps to ``payments.amount``).
    Caller must ``commit``; may raise ``IntegrityError`` on duplicate ``stripe_session_id``.
    """
    ref_raw = data.get("referral_code")
    ref_norm = (str(ref_raw).strip().upper() if ref_raw else None) or None
    ride = data.get("ride_id")
    sid = str(data.get("stripe_session_id") or "").strip() or None
    p = Payment(
        booking_id=int(data["booking_id"]),
        ride_id=int(ride) if ride is not None else None,
        amount=float(data["total_amount"]),
        commission_amount=round(float(data["platform_amount"]) + float(data["bnb_amount"]), 2),
        driver_amount=float(data["driver_amount"]),
        platform_amount=float(data["platform_amount"]),
        bnb_amount=float(data["bnb_amount"]),
        referral_code=ref_norm,
        status=str(data.get("status") or "paid"),
        stripe_payment_intent=data.get("stripe_payment_intent"),
        stripe_session_id=sid,
        driver_id=_coerce_optional_fk(data.get("driver_id")),
        bnb_id=_coerce_optional_fk(data.get("bnb_id")),
    )
    db.add(p)
    return p


def _payment_row_for_booking(
    db: Session,
    booking: Booking,
    gross_eur: float,
    status: str,
    *,
    stripe_payment_intent: str | None = None,
    ride_id: int | None = None,
    split_override: tuple[float, float, float] | None = None,
    referral_code: str | None = None,
    stripe_session_id: str | None = None,
    payment_driver_id: int | None = None,
    payment_bnb_id: int | None = None,
) -> Payment:
    """
    ``split_override``: optional ``(driver_eur, bnb_eur, platform_eur)`` (e.g. marketplace 70/10/20
    from webhook). Otherwise derive from trip / booking.
    """
    tid = ride_id if ride_id is not None else getattr(booking, "trip_id", None)
    trip = db.query(Trip).filter(Trip.id == int(tid)).first() if tid else None

    ref_raw = referral_code if referral_code is not None else getattr(booking, "referral_code", None)
    ref_norm = (str(ref_raw).strip().upper() if ref_raw else None) or None

    if split_override is not None:
        drv_e, bnb_e, plat_e = split_override
        gross = float(gross_eur)
        comm_total = round(float(plat_e) + float(bnb_e), 2)
        return Payment(
            booking_id=int(booking.id),
            ride_id=int(tid) if tid else None,
            amount=float(gross),
            commission_amount=comm_total,
            driver_amount=round(float(drv_e), 2),
            platform_amount=round(float(plat_e), 2),
            bnb_amount=round(float(bnb_e), 2),
            referral_code=ref_norm,
            status=status,
            stripe_payment_intent=stripe_payment_intent,
            stripe_session_id=(str(stripe_session_id).strip() or None) if stripe_session_id else None,
            driver_id=_coerce_optional_fk(payment_driver_id),
            bnb_id=_coerce_optional_fk(payment_bnb_id),
        )

    _, comm, drv = split_for_booking_and_trip(booking=booking, trip=trip, gross_override=float(gross_eur))
    bnb_e = 0.0
    plat_e = float(comm)
    if trip is not None and getattr(trip, "bnb_commission", None) is not None:
        try:
            bnb_e = round(float(trip.bnb_commission), 2)
        except (TypeError, ValueError):
            bnb_e = 0.0
    if trip is not None and getattr(trip, "platform_commission", None) is not None:
        try:
            plat_e = round(float(trip.platform_commission), 2)
        except (TypeError, ValueError):
            plat_e = round(max(0.0, float(comm) - bnb_e), 2)
    elif bnb_e > 0:
        plat_e = round(max(0.0, float(comm) - bnb_e), 2)

    return Payment(
        booking_id=int(booking.id),
        ride_id=int(tid) if tid else None,
        amount=float(gross_eur),
        commission_amount=round(float(comm), 2),
        driver_amount=float(drv),
        platform_amount=round(float(plat_e), 2),
        bnb_amount=round(float(bnb_e), 2),
        referral_code=ref_norm,
        status=status,
        stripe_payment_intent=stripe_payment_intent,
        stripe_session_id=(str(stripe_session_id).strip() or None) if stripe_session_id else None,
        driver_id=_coerce_optional_fk(payment_driver_id),
        bnb_id=_coerce_optional_fk(payment_bnb_id),
    )


def _trip_linked_to_booking(db: Session, booking: Booking) -> Trip | None:
    tid = getattr(booking, "trip_id", None)
    if tid is not None:
        return db.query(Trip).filter(Trip.id == int(tid)).first()
    return (
        db.query(Trip)
        .join(Booking, Booking.trip_id == Trip.id)
        .filter(Booking.id == booking.id)
        .first()
    )


def _webhook_fulfill_booking_checkout(db: Session, session: dict, md: dict) -> JSONResponse:
    """metadata.booking_id: confirm pending/paid booking, create trip, send confirmation email once."""
    try:
        booking_id = int(md.get("booking_id") or 0)
    except (TypeError, ValueError):
        return JSONResponse(status_code=200, content={"status": "error", "detail": "Invalid booking_id"})

    booking = db.query(Booking).filter(Booking.id == booking_id).with_for_update().first()
    if booking is None:
        return JSONResponse(status_code=200, content={"status": "error", "detail": "Booking not found"})

    st = str(getattr(booking, "status", "") or "").lower()
    if st == "confirmed":
        return JSONResponse(status_code=200, content={"status": "ok", "note": "already_confirmed"})

    if st not in ("pending", "paid"):
        return JSONResponse(
            status_code=200,
            content={"status": "error", "detail": f"Booking not payable in status {st!r}"},
        )

    booking.status = "confirmed"
    booking.stripe_session_id = session["id"]

    # Record Stripe payment
    try:
        pi = session.get("payment_intent")
        amount_total = float(session.get("amount_total") or 0) / 100.0
    except Exception:
        pi = None
        amount_total = float(getattr(booking, "price", 0) or 0)
    if amount_total <= 0:
        amount_total = float(getattr(booking, "price", 0) or 0)

    if pi:
        booking.payment_intent_id = str(pi)

    linked = _trip_linked_to_booking(db, booking)
    if linked is not None and getattr(booking, "trip_id", None) is None:
        booking.trip_id = linked.id

    if getattr(booking, "trip_id", None) is None:
        TripService.create_from_booking(db=db, booking=booking, send_customer_notification=False)
    else:
        db.commit()
        db.refresh(booking)

    db.refresh(booking)
    booking.payment_status = "paid"
    ref_strict, bnb_strict = resolve_valid_bnb_referral(db, getattr(booking, "referral_code", None))
    booking.referral_code = ref_strict
    booking.bnb_id = bnb_strict
    db.add(booking)
    has_bnb = bool(bnb_strict)
    drv_e, bnb_e, plat_e = marketplace_checkout_split_eur(amount_total, has_bnb)
    ref_pay = ref_strict
    pk_drv = _metadata_positive_int(md, "driver_id") or _coerce_optional_fk(
        getattr(booking, "driver_id", None)
    )
    pk_bnb = _coerce_optional_fk(bnb_strict)
    payment = insert_payment(
        db,
        {
            "booking_id": booking.id,
            "stripe_session_id": session["id"],
            "driver_id": pk_drv,
            "bnb_id": pk_bnb,
            "total_amount": amount_total,
            "driver_amount": drv_e,
            "bnb_amount": bnb_e,
            "platform_amount": plat_e,
            "referral_code": ref_pay,
            "status": "paid",
            "stripe_payment_intent": str(pi) if pi else None,
            "ride_id": getattr(booking, "trip_id", None),
        },
    )
    if pk_bnb is not None:
        increment_provider_bnb_earnings(db, int(pk_bnb), float(bnb_e))
    try:
        db.commit()
        db.refresh(booking)
        db.refresh(payment)
    except IntegrityError:
        db.rollback()
        print("⚠️ Payment already processed")
        return JSONResponse(status_code=200, content={"status": "ignored"})
    print("💸 PAYMENT SAVED")
    print("Session:", session.get("id"))
    print("Driver:", drv_e)
    print("BNB:", bnb_e)
    print("Platform:", plat_e)
    run_post_checkout_balance_transfers(db, payment, md)

    try:
        threading.Thread(
            target=send_confirmation_email,
            kwargs={"to_email": booking.email, "booking": booking},
            daemon=True,
        ).start()
    except Exception as e:
        logger.warning("Confirmation email thread failed: %s", e)

    return JSONResponse(status_code=200, content={"status": "success"})


def _webhook_fulfill_quote_checkout(db: Session, session: dict, md: dict) -> JSONResponse:
    """metadata.quote_id: create Booking + Trip from Quote; email Trip confermato."""
    try:
        quote_id = int(md.get("quote_id") or 0)
    except (TypeError, ValueError):
        return JSONResponse(status_code=200, content={"status": "error", "detail": "Invalid quote_id"})

    quote = db.query(Quote).filter(Quote.id == quote_id).with_for_update().first()
    if quote is None:
        return JSONResponse(status_code=200, content={"status": "error", "detail": "Quote not found"})

    st = str(getattr(quote, "status", "") or "").lower()
    if st == "confirmed":
        return JSONResponse(status_code=200, content={"status": "ok", "note": "already_confirmed"})
    if st != "pending":
        return JSONResponse(
            status_code=200,
            content={"status": "error", "detail": f"Quote not payable in status {st!r}"},
        )

    booking, trip = fulfill_quote_to_booking_and_trip(db, quote, stripe_session_id=session["id"])

    # Record Stripe payment for the created booking.
    try:
        pi = session.get("payment_intent")
        amount_total = float(session.get("amount_total") or 0) / 100.0
    except Exception:
        pi = None
        amount_total = float(getattr(booking, "price", 0) or 0)
    if amount_total <= 0:
        amount_total = float(getattr(booking, "price", 0) or 0)

    if pi:
        booking.payment_intent_id = str(pi)
    booking.payment_status = "paid"
    has_bnb = checkout_metadata_has_bnb_id(md, booking)
    drv_e, bnb_e, plat_e = marketplace_checkout_split_eur(amount_total, has_bnb)
    ref_pay = md.get("referral_code") or getattr(booking, "referral_code", None)
    pk_drv = _metadata_positive_int(md, "driver_id") or _coerce_optional_fk(
        getattr(booking, "driver_id", None)
    )
    pk_bnb = _metadata_positive_int(md, "bnb_id") or _coerce_optional_fk(getattr(booking, "bnb_id", None))
    db.add(booking)
    payment = insert_payment(
        db,
        {
            "booking_id": booking.id,
            "stripe_session_id": session["id"],
            "driver_id": pk_drv,
            "bnb_id": pk_bnb,
            "total_amount": amount_total,
            "driver_amount": drv_e,
            "bnb_amount": bnb_e,
            "platform_amount": plat_e,
            "referral_code": ref_pay,
            "status": "paid",
            "stripe_payment_intent": str(pi) if pi else None,
            "ride_id": getattr(booking, "trip_id", None),
        },
    )
    if pk_bnb is not None:
        increment_provider_bnb_earnings(db, int(pk_bnb), float(bnb_e))
    try:
        db.commit()
        db.refresh(payment)
    except IntegrityError:
        db.rollback()
        print("⚠️ Payment already processed")
        return JSONResponse(status_code=200, content={"status": "ignored"})
    print("💸 PAYMENT SAVED")
    print("Session:", session.get("id"))
    print("Driver:", drv_e)
    print("BNB:", bnb_e)
    print("Platform:", plat_e)
    run_post_checkout_balance_transfers(db, payment, md)
    threading.Thread(
        target=send_trip_confirmed_email,
        kwargs={"to_email": booking.email, "booking": booking, "trip": trip},
        daemon=True,
    ).start()

    return JSONResponse(status_code=200, content={"status": "success"})


class CheckoutRequest(BaseModel):
    booking_id: int
    amount: float | None = None


@router.post("/create-checkout-session")
def create_checkout_session_endpoint(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
) -> dict:
    booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if str(getattr(booking, "status", "") or "").lower() != "pending":
        raise HTTPException(status_code=400, detail="Only pending bookings can be paid")
    try:
        return create_checkout_session(
            amount=float(booking.price or 0),
            booking_id=payload.booking_id,
            bnb_id=getattr(booking, "bnb_id", None),
        )
    except CheckoutSessionCreationError:
        raise HTTPException(status_code=500, detail="Pagamento non disponibile") from None


class PayCheckoutSessionBody(BaseModel):
    """
    Either:
    - Exactly one of booking_id (tour/instance pending) or quote_id (custom ride preventivo), or
    - Client-app style: title + price (simple one-off checkout, no DB booking).
    """

    booking_id: int | None = None
    quote_id: int | None = None
    title: str | None = None
    price: float | None = None


@router.post("/payments/create-checkout-session")
def create_payment_checkout_session(
    payload: PayCheckoutSessionBody,
    db: Session = Depends(get_db),
) -> dict:
    has_b = payload.booking_id is not None
    has_q = payload.quote_id is not None
    has_title = payload.title is not None
    has_price = payload.price is not None
    has_generic = has_title or has_price

    if has_generic:
        if has_b or has_q:
            raise HTTPException(
                status_code=400,
                detail="Use either (title, price) or booking_id/quote_id, not both",
            )
        if not has_title or not has_price:
            raise HTTPException(
                status_code=400,
                detail="Both title and price are required for this checkout mode",
            )
        title = str(payload.title or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title must be non-empty")
        try:
            price_val = float(payload.price)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="price must be a number") from None
        if price_val <= 0:
            raise HTTPException(status_code=400, detail="price must be positive")
        try:
            out = create_simple_checkout_session(title=title, amount_eur=price_val)
            return {"checkout_url": out["checkout_url"], "url": out.get("url"), "session_id": out.get("session_id")}
        except CheckoutSessionCreationError:
            raise HTTPException(status_code=500, detail="Pagamento non disponibile") from None

    if has_b == has_q:
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of booking_id or quote_id",
        )

    try:
        if payload.quote_id is not None:
            quote = db.query(Quote).filter(Quote.id == payload.quote_id).first()
            if quote is None:
                raise HTTPException(status_code=404, detail="Quote not found")
            if str(getattr(quote, "status", "") or "").lower() != "pending":
                raise HTTPException(status_code=400, detail="Only pending quotes can be paid")
            product = f"Transfer preventivo #{quote.id}"[:120]
            return create_pending_quote_checkout_session(
                quote_id=int(quote.id),
                amount_eur=float(quote.price or 0),
                customer_email=str(quote.email or "").strip() or "customer@example.com",
                product_name=product,
            )

        booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        if str(getattr(booking, "status", "") or "").lower() != "pending":
            raise HTTPException(status_code=400, detail="Only pending bookings can be paid")
        tour_title = None
        if getattr(booking, "tour_id", None) is not None:
            tour = db.query(Tour).filter(Tour.id == booking.tour_id).first()
            tour_title = getattr(tour, "title", None) if tour is not None else None
        product = (tour_title or f"NCC Booking #{booking.id}")[:120]
        return create_pending_booking_checkout_session(
            booking_id=int(booking.id),
            amount_eur=float(booking.price or 0),
            customer_email=str(booking.email or "").strip() or "customer@example.com",
            product_name=product,
            bnb_id=getattr(booking, "bnb_id", None),
        )
    except HTTPException:
        raise
    except CheckoutSessionCreationError:
        raise HTTPException(status_code=500, detail="Pagamento non disponibile") from None


class TourCheckoutRequest(BaseModel):
    tour_id: int
    tour_instance_id: int | None = None
    name: str
    email: str
    date: str | None = None
    passengers: int
    has_bnb: bool = False


# Backward-compatible name for OpenAPI clients (alias: ``seats`` or ``people``).
TourInstanceCheckoutBody = TourBookingCheckoutCreate


@router.post("/payments/create-checkout")
def create_checkout_for_tour_instance(
    request: Request,
    payload: TourBookingCheckoutCreate,
    db: Session = Depends(get_db),
    ref: Annotated[
        str | None,
        Query(description="Referral from ?ref= (used when JSON body has no referral_code)"),
    ] = None,
) -> dict:
    try:
        body_ref = (payload.referral_code or "").strip()
        if not body_ref:
            referral = get_referral_from_host(request)
            print("Referral from host:", referral, flush=True)
            sub_ref = referral
        else:
            sub_ref = getattr(request.state, "referral_subdomain", None)
        return create_tour_booking_checkout(
            db,
            payload,
            referral_query=ref,
            referral_subdomain=sub_ref,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("create_checkout_for_tour_instance failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/payments/tour/create-checkout-session")
def create_tour_checkout_session_endpoint(
    payload: TourCheckoutRequest,
    db: Session = Depends(get_db),
) -> dict:
    if payload.passengers < 1:
        raise HTTPException(status_code=400, detail="passengers must be >= 1")

    tour = db.query(Tour).filter(Tour.id == payload.tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    instance = None
    if payload.tour_instance_id is not None:
        instance = (
            db.query(TourInstance)
            .filter(TourInstance.id == payload.tour_instance_id, TourInstance.tour_id == tour.id)
            .first()
        )
    elif payload.date:
        try:
            requested_date = Date.fromisoformat(payload.date)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid date format (expected YYYY-MM-DD)") from exc
        instance = (
            db.query(TourInstance)
            .filter(TourInstance.tour_id == tour.id, TourInstance.date == requested_date)
            .first()
        )
        if instance is None:
            instance = TourInstance(
                tour_id=tour.id,
                date=requested_date,
                status="active",
                vehicles=0,
                capacity=0,
                vehicle_ids=[],
            )
            db.add(instance)
            db.commit()
            db.refresh(instance)
    else:
        raise HTTPException(status_code=400, detail="tour_instance_id or date is required")

    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")

    inst_id = int(instance.id)
    instance_locked = (
        db.query(TourInstance)
        .filter(TourInstance.id == inst_id, TourInstance.tour_id == tour.id)
        .with_for_update()
        .first()
    )
    if instance_locked is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Tour instance not found")
    if _instance_blocks_new_bookings(instance_locked):
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Turno non disponibile per il pagamento (annullato o completato)",
        )

    capacity, held = capacity_and_held(db, inst_id)
    passengers_n = int(payload.passengers)
    if not can_book_seats(capacity, held, passengers_n):
        log_overbooking_reject(
            phase="pre_checkout_stripe_legacy",
            tour_instance_id=inst_id,
            seats_requested=passengers_n,
            capacity=capacity,
            held=held,
        )
        db.rollback()
        raise HTTPException(status_code=400, detail="Not enough seats")

    tour_id_snap = int(tour.id)
    tour_title_snap = tour.title or ""
    unit_final = round(float(tour.price) * 1.25, 2)
    date_iso = instance_locked.date.isoformat()

    db.commit()

    try:
        return create_tour_checkout_session(
            tour_id=tour_id_snap,
            tour_instance_id=inst_id,
            tour_title=tour_title_snap,
            unit_amount_eur=unit_final,
            passengers=passengers_n,
            customer_email=payload.email,
            name=payload.name,
            date=date_iso,
            has_bnb=bool(payload.has_bnb),
        )
    except CheckoutSessionCreationError:
        raise HTTPException(status_code=500, detail="Pagamento non disponibile") from None


@router.post("/payments/webhook")
async def stripe_payments_webhook(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    logger.info("Stripe webhook received")
    # Raw body bytes — do not use request.json() here or signature verification will fail.
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            endpoint_secret,
        )
    except Exception as e:
        logger.warning("Stripe webhook signature verification failed: %s", e)
        return JSONResponse(status_code=400, content={"status": "error", "detail": "invalid signature"})

    print("Webhook received:", event["type"])
    logger.info("Webhook received: %s id=%s", event["type"], event.get("id"))

    if event["type"] not in ("checkout.session.completed", "payment_intent.succeeded"):
        return JSONResponse(status_code=200, content={"status": "ignored"})

    event_id = event["id"]
    if _stripe_event_already_processed(db, event_id):
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "note": "event_already_processed"},
        )

    try:
        obj = event["data"]["object"]
        md = obj.get("metadata") or {}

        if event["type"] == "payment_intent.succeeded":
            pi_id = obj.get("id")
            existing_pi = None
            if pi_id:
                existing_pi = db.query(Payment).filter(Payment.stripe_payment_intent == str(pi_id)).first()

            if existing_pi is None:
                ride_id = md.get("ride_id")
                booking_id = md.get("booking_id")
                booking = None
                if booking_id:
                    try:
                        booking = db.query(Booking).filter(Booking.id == int(booking_id)).first()
                    except Exception:
                        booking = None
                if booking is None and ride_id:
                    try:
                        booking = (
                            db.query(Booking)
                            .filter(Booking.trip_id == int(ride_id))
                            .order_by(Booking.id.desc())
                            .first()
                        )
                    except Exception:
                        booking = None

                if booking is not None:
                    amount_received = obj.get("amount_received") or obj.get("amount") or 0
                    amount_eur = (
                        float(amount_received) / 100.0
                        if amount_received
                        else float(getattr(booking, "price", 0) or 0)
                    )

                    booking.payment_intent_id = str(pi_id) if pi_id else getattr(
                        booking, "payment_intent_id", None
                    )
                    rid = int(getattr(booking, "trip_id", 0) or 0) or (
                        int(ride_id) if ride_id else None
                    )
                    trip_pi = db.query(Trip).filter(Trip.id == int(rid)).first() if rid else None
                    db.add(
                        _payment_row_for_booking(
                            db,
                            booking,
                            float(amount_eur or 0),
                            "paid",
                            stripe_payment_intent=str(pi_id) if pi_id else None,
                            ride_id=rid or None,
                            referral_code=getattr(booking, "referral_code", None),
                        )
                    )
                    db.commit()
                else:
                    logger.info(
                        "payment_intent.succeeded: no ride booking row for pi=%s (tour/checkout only is ok)",
                        pi_id,
                    )

            try:
                apply_bnb_commission_for_payment_intent(db, obj)
                db.commit()
            except IntegrityError:
                db.rollback()
                logger.info(
                    "B&B commission DB idempotent skip (payment_intent=%s)",
                    obj.get("id"),
                )

            body: dict = {"status": "ok"}
            if existing_pi is not None:
                body["note"] = "already_recorded"
            resp = JSONResponse(status_code=200, content=body)
            _stripe_event_mark_done(db, event_id)
            return resp

        session = obj
        sid = session.get("id")

        if sid and get_payment_by_session(db, str(sid)):
            print("⚠️ Payment already processed")
            _stripe_event_mark_done(db, event_id)
            return JSONResponse(status_code=200, content={"status": "ignored"})

        if not sid:
            return JSONResponse(
                status_code=200,
                content={"status": "error", "detail": "missing checkout session id"},
            )

        existing = db.query(Booking).filter(Booking.stripe_session_id == sid).first()
        if existing is not None:
            if getattr(existing, "trip_id", None) is None:
                tr = _trip_linked_to_booking(db, existing)
                if tr is not None:
                    existing.trip_id = tr.id
                    db.commit()
                    db.refresh(existing)
            resp = JSONResponse(
                status_code=200,
                content={"status": "success", "note": "already_processed"},
            )
            _stripe_event_mark_done(db, event_id)
            return resp

        if md.get("quote_id"):
            resp = _webhook_fulfill_quote_checkout(db, session, md)
        elif md.get("booking_id"):
            resp = _webhook_fulfill_booking_checkout(db, session, md)
        elif md.get("tour_instance_id"):
            md_tour = normalize_tour_checkout_metadata(db, md)
            if md_tour.get("tour_id"):
                resp = fulfill_tour_instance_checkout_session(db, session, md_tour)
            else:
                resp = JSONResponse(
                    status_code=200,
                    content={"status": "error", "detail": "Unknown tour_instance_id"},
                )
        else:
            resp = JSONResponse(
                status_code=200,
                content={"status": "ignored", "detail": "metadata not recognized"},
            )

        if _stripe_checkout_response_should_record(resp):
            _stripe_event_mark_done(db, event_id)
        return resp
    except Exception:
        logger.exception("Stripe webhook processing failed")
        db.rollback()
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": "Webhook processing failed"},
        )


# Stripe CLI (and many dashboards) commonly default to /webhooks/stripe.
# Keep this as a thin alias so existing integrations continue working.
@router.post("/webhooks/stripe")
async def stripe_webhook_alias(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    return await stripe_payments_webhook(request=request, db=db)
