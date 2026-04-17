"""
Stripe ``checkout.session.completed`` → tour instance booking fulfillment.

**Step 1 — Verify signature** is performed in the FastAPI route (``stripe.Webhook.construct_event``).

This module implements:

2. Extract metadata (``tour_id``, ``tour_instance_id``, ``date``, ``people``, ``referral_code``, ``customer_name``, …).
3. Load ``TourInstance`` (with ``tour_id`` inferred from DB if omitted in metadata).
4. Re-check available seats (capacity vs held bookings, ``FOR UPDATE``).
5. Create ``Booking`` (``status='confirmed'``, ``stripe_session_id``).
6. **Effective** seat availability: no separate counter — the new ``Booking.people`` reduces
   computed availability (same constants as checkout).
7. If ``referral_code`` resolves, set ``bnb_id`` on the booking.
8. Split gross into driver / B&B / platform (``marketplace_checkout_split_eur``) and insert ``Payment``.
9. ``record_bnb_commission_after_payment`` → ``Provider.total_earnings`` + ``bnb_earnings`` row for the B&B.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import date as DateType
from datetime import time as Time
from pathlib import Path

from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.routers.tour_instances import _instance_blocks_new_bookings
from app.services.email_service import send_booking_email
from app.services.payment_ledger import marketplace_checkout_split_eur
from app.services.referral_booking import record_bnb_commission_after_payment, resolve_valid_bnb_referral
from app.services.checkout_balance_transfers import run_post_checkout_balance_transfers
from app.services.tour_stripe_booking import (
    parse_seats_from_tour_checkout_metadata,
    resolve_driver_id_for_tour_booking,
    verify_checkout_session_paid,
)
from app.services.tour_instance_availability import (
    can_book_seats,
    capacity_and_held,
    log_overbooking_reject,
)
from app.services.trip_service import TripService
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)


def _customer_email_from_stripe_checkout_session(session: dict) -> str | None:
    """Email entered on Stripe Checkout when ``customer_email`` was omitted at session creation."""
    em = session.get("customer_email")
    if em:
        s = str(em).strip()
        if s:
            return s
    cd = session.get("customer_details") or {}
    em2 = cd.get("email")
    if em2:
        s = str(em2).strip()
        if s:
            return s
    return None


def _webhook_reject(db: Session, body: dict) -> JSONResponse:
    """End DB transaction and return a 200 JSON body (Stripe expects 2xx)."""
    try:
        db.rollback()
    except Exception:
        logger.exception("Stripe tour webhook: rollback failed after reject")
    return JSONResponse(status_code=200, content=body)


def normalize_tour_checkout_metadata(db: Session, md: dict) -> dict:
    """
    Normalize tour Checkout metadata for webhooks.

    - Ensures ``tour_id`` when only ``tour_instance_id`` is present.
    - Backfills ``date`` (YYYY-MM-DD) from the instance when missing (older sessions).
    """
    out = dict(md or {})
    raw_iid = out.get("tour_instance_id")
    inst: TourInstance | None = None
    if raw_iid is not None and str(raw_iid).strip() != "":
        try:
            iid = int(str(raw_iid).strip())
            inst = db.query(TourInstance).filter(TourInstance.id == iid).first()
        except (TypeError, ValueError):
            inst = None
    if inst is not None:
        if not (str(out.get("tour_id") or "").strip()):
            out["tour_id"] = str(int(inst.tour_id))
        if not (str(out.get("date") or "").strip()) and getattr(inst, "date", None) is not None:
            out["date"] = inst.date.isoformat()[:10]
    return out


def fulfill_tour_instance_checkout_session(
    db: Session,
    session: dict,
    md: dict,
) -> JSONResponse:
    """
    Handle a paid Checkout Session for a tour instance (metadata from
    :func:`app.services.stripe_service.create_tour_instance_checkout_session`).
    """
    # Lazy import avoids circular import with ``app.routers.payments`` (insert_payment).
    from app.routers.payments import _coerce_optional_fk, _metadata_positive_int, insert_payment

    pay_err = verify_checkout_session_paid(session)
    if pay_err is not None:
        return JSONResponse(
            status_code=200,
            content={"status": "error", "detail": f"Payment verification failed: {pay_err}"},
        )

    # --- Step 2: metadata ---
    try:
        tour_id = int(md["tour_id"])
        instance_id = int(md["tour_instance_id"])
        customer_name = str(md.get("customer_name") or md.get("name") or "").strip()
        email_raw = str(md.get("email") or "").strip()
        email = email_raw or _customer_email_from_stripe_checkout_session(session) or "customer@example.com"
        phone_raw = md.get("customer_phone") or md.get("phone")
        customer_phone = str(phone_raw).strip() if phone_raw not in (None, "") else "N/A"
        passengers = parse_seats_from_tour_checkout_metadata(md)
    except Exception as e:
        return JSONResponse(status_code=200, content={"status": "error", "detail": f"Bad tour metadata: {e}"})
    if passengers is None or int(passengers) < 1:
        return JSONResponse(
            status_code=200,
            content={"status": "error", "detail": "Invalid or missing seats in checkout metadata"},
        )
    if not customer_name:
        return JSONResponse(
            status_code=200,
            content={"status": "error", "detail": "Missing customer_name in checkout metadata"},
        )
    passengers = int(passengers)

    try:
        # --- Step 3 & 4: instance + seat check ---
        instance = (
            db.query(TourInstance)
            .filter(TourInstance.id == instance_id, TourInstance.tour_id == tour_id)
            .with_for_update()
            .first()
        )
        if instance is None:
            return _webhook_reject(
                db,
                {"status": "error", "detail": "Tour instance not found"},
            )

        md_date_raw = (md.get("date") or "").strip()
        if md_date_raw:
            try:
                md_day = DateType.fromisoformat(md_date_raw[:10])
                if md_day != instance.date:
                    logger.warning(
                        "Tour checkout metadata date %s != instance.date %s (instance_id=%s); using DB instance date",
                        md_day,
                        instance.date,
                        instance.id,
                    )
            except ValueError:
                logger.warning("Tour checkout metadata date invalid: %r", md_date_raw)

        if _instance_blocks_new_bookings(instance):
            return _webhook_reject(
                db,
                {
                    "status": "error",
                    "detail": "Tour instance non disponibile (annullato o completato)",
                },
            )

        capacity, held = capacity_and_held(db, instance.id)
        if not can_book_seats(capacity, held, passengers):
            log_overbooking_reject(
                phase="webhook_checkout_completed",
                tour_instance_id=int(instance.id),
                seats_requested=passengers,
                capacity=capacity,
                held=held,
                stripe_session_id=str(session.get("id") or ""),
            )
            return _webhook_reject(
                db,
                {
                    "status": "error",
                    "detail": "No seats available",
                    "reject": "overbooking",
                },
            )

        tour = db.query(Tour).filter(Tour.id == tour_id).first()
        if tour is None:
            return _webhook_reject(db, {"status": "error", "detail": "Tour not found"})

        # --- Step 7: referral → BNB (canonical ``referral_code`` from Checkout metadata) ---
        ref_in = (md.get("referral_code") or "").strip() or None
        referral_code, bnb_id = resolve_valid_bnb_referral(db, ref_in)
        has_bnb = bool(bnb_id)
        inst_override = getattr(instance, "price", None)
        if inst_override is not None:
            unit_customer = float(inst_override)
            final_total = round(unit_customer * passengers, 2)
            total_base = round((unit_customer / 1.25) * passengers, 2)
        else:
            unit_base = float(tour.price)
            total_base = round(unit_base * passengers, 2)
            final_total = round(total_base * 1.25, 2)

        driver_id_booking = resolve_driver_id_for_tour_booking(db, instance, md)

        start_t = getattr(instance, "start_time", None)
        booking_time = start_t if start_t is not None else Time(0, 0)

        # --- Step 5 & 6: booking row (reduces available seats computationally) ---
        booking = Booking(
            tour_id=tour_id,
            tour_instance_id=instance.id,
            driver_id=driver_id_booking,
            customer_name=customer_name,
            email=email,
            phone=customer_phone,
            date=instance.date,
            time=booking_time,
            people=passengers,
            base_price=total_base,
            price=final_total,
            has_bnb=has_bnb,
            referral_code=referral_code,
            bnb_id=bnb_id,
            stripe_session_id=session["id"],
            status="confirmed",
        )

        db.add(booking)
        db.flush()

        try:
            pi = session.get("payment_intent")
            amount_total = float(session.get("amount_total") or 0) / 100.0
        except Exception:
            pi = None
            amount_total = float(final_total or 0)
        if amount_total <= 0:
            amount_total = float(final_total or 0)

        if pi:
            booking.payment_intent_id = str(pi)

        TripService.create_from_booking(db=db, booking=booking, send_customer_notification=False)
        db.refresh(booking)
        booking.payment_status = "paid"

        # --- Step 8: earnings split ---
        drv_e, bnb_e, plat_e = marketplace_checkout_split_eur(float(amount_total), has_bnb)
        pk_drv = _coerce_optional_fk(getattr(booking, "driver_id", None)) or _metadata_positive_int(
            md, "driver_id"
        )
        pk_bnb = _coerce_optional_fk(bnb_id)
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
                "referral_code": referral_code,
                "status": "paid",
                "stripe_payment_intent": str(pi) if pi else None,
                "ride_id": getattr(booking, "trip_id", None),
            },
        )

        # --- Step 9: BNB total_earnings + bnb_earnings audit row ---
        if pk_bnb is not None and float(bnb_e or 0) > 0:
            record_bnb_commission_after_payment(
                db,
                payment=payment,
                bnb_provider_id=int(pk_bnb),
                commission_eur=float(bnb_e),
                gross_eur=float(amount_total),
            )
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

        occupied_after = int(held) + passengers

        threading.Thread(
            target=send_booking_email,
            args=(
                email,
                customer_name,
                tour.title or "",
                str(instance.date),
                passengers,
                booking.id,
            ),
            daemon=True,
        ).start()

        manager.broadcast_tour_instance_sync(
            instance.id,
            {
                "type": "booking_created",
                "booking": {
                    "id": booking.id,
                    "name": booking.customer_name,
                    "passengers": int(booking.people),
                    "status": "confirmed",
                },
                "bookings": [
                    {
                        "id": booking.id,
                        "name": booking.customer_name,
                        "passengers": int(booking.people),
                        "status": "confirmed",
                    }
                ],
            },
        )
        manager.broadcast_tour_instance_sync(
            instance.id,
            {
                "type": "capacity_updated",
                "capacity": int(capacity),
                "occupied": occupied_after,
            },
        )

        try:
            import qrcode

            data = {
                "booking_id": booking.id,
                "tour_id": booking.tour_id,
                "name": booking.customer_name,
            }
            qr_data = json.dumps(data)
            img = qrcode.make(qr_data)

            base_dir = Path(__file__).resolve().parents[2]
            qrcodes_dir = base_dir / "static" / "qrcodes"
            qrcodes_dir.mkdir(parents=True, exist_ok=True)

            filename = f"qr_{booking.id}.png"
            file_path = qrcodes_dir / filename
            img.save(str(file_path))

            booking.qr_code = f"/static/qrcodes/{filename}"
            db.commit()
        except Exception as e:
            logger.warning("QR generation failed for booking %s: %s", booking.id, e)

        return JSONResponse(status_code=200, content={"status": "success"})
    except Exception:
        logger.exception("Stripe webhook tour fulfillment failed")
        db.rollback()
        raise
