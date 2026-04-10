"""
Tour booking flow: Stripe Checkout Session → ``checkout.session.completed`` webhook.

1. **Checkout** — Client calls :func:`create_tour_booking_checkout` (no ``Booking`` row yet).
2. **Webhook** — Verify payment, create :class:`~app.models.booking.Booking`, resolve
   ``referral_code`` → ``bnb_id`` (B&B provider), assign ``driver_id`` from session metadata
   or tour instance, persist :class:`~app.models.payment.Payment` with B&B share → ledger /
   Connect transfers update B&B earnings.

The ORM column for seat count remains ``bookings.people``; :attr:`Booking.seats` is a synonym.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.driver import Driver
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.routers.tour_instances import _instance_blocks_new_bookings
from app.schemas.tour_booking_checkout import TourBookingCheckoutCreate
from app.services.referral_booking import resolve_valid_bnb_referral
from app.services.stripe_service import CheckoutSessionCreationError, create_tour_instance_checkout_session
from app.services.tour_instance_availability import (
    can_book_seats,
    capacity_and_held,
    log_overbooking_reject,
)
from app.services.trip_service import TripService

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def metadata_positive_int(metadata: dict, key: str) -> int | None:
    v = metadata.get(key) if metadata else None
    if v is None or str(v).strip() == "":
        return None
    try:
        n = int(v)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def verify_checkout_session_paid(session: dict) -> str | None:
    """
    Ensure Checkout Session represents a completed payment.
    Returns an error detail string if not paid, else ``None``.
    """
    mode = str(session.get("mode") or "").lower()
    if mode and mode != "payment":
        return f"unsupported checkout mode: {mode}"
    ps = str(session.get("payment_status") or "").lower()
    if ps not in ("paid", "no_payment_required"):
        return f"payment_status is {ps!r}, expected paid"
    return None


def resolve_driver_id_for_tour_booking(db: Session, instance: TourInstance, metadata: dict) -> int | None:
    """
    Prefer ``driver_id`` from Stripe metadata (set at checkout from the instance),
    otherwise the instance's assigned driver (same rules as :class:`TripService`).
    """
    md_id = metadata_positive_int(metadata, "driver_id")
    ti_driver, _ = TripService._driver_vehicle_from_tour_instance(db, instance)
    if md_id is not None:
        if ti_driver is not None and md_id != ti_driver:
            logger.warning(
                "checkout metadata driver_id=%s differs from instance driver_id=%s (using metadata)",
                md_id,
                ti_driver,
            )
        return md_id
    return ti_driver


def parse_seats_from_tour_checkout_metadata(md: dict) -> int | None:
    raw = md.get("seats") if md.get("seats") not in (None, "") else md.get("passengers")
    if raw is None or str(raw).strip() == "":
        return None
    try:
        n = int(raw)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def create_tour_booking_checkout(
    db: Session,
    payload: TourBookingCheckoutCreate,
    *,
    referral_query: str | None = None,
    referral_subdomain: str | None = None,
) -> dict:
    """
    Validate inventory and create a Stripe Checkout Session for the tour instance.
    Does **not** insert a ``Booking``; the webhook does that after payment succeeds.

    Uses ``SELECT … FOR UPDATE`` on the tour instance and **commits** before calling Stripe
    so the row lock is not held during the HTTP call to Stripe (webhook re-checks seats).
    """
    instance = (
        db.query(TourInstance)
        .filter(TourInstance.id == payload.tour_instance_id)
        .with_for_update()
        .first()
    )
    if instance is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Tour instance not found")
    if _instance_blocks_new_bookings(instance):
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Turno non disponibile per il pagamento (annullato o completato)",
        )

    tour = db.query(Tour).filter(Tour.id == instance.tour_id).first()
    if tour is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Tour not found")

    capacity, held = capacity_and_held(db, instance.id)
    seats_req = int(payload.seats)
    if not can_book_seats(capacity, held, seats_req):
        log_overbooking_reject(
            phase="pre_checkout_stripe",
            tour_instance_id=int(instance.id),
            seats_requested=seats_req,
            capacity=capacity,
            held=held,
        )
        db.rollback()
        raise HTTPException(status_code=400, detail="Not enough seats")

    inst_price = getattr(instance, "price", None)
    tour_price = float(tour.price or 0)
    if inst_price is not None:
        unit_final = round(float(inst_price), 2)
    else:
        unit_final = round(tour_price * 1.25, 2)

    raw_ref = (
        (payload.referral_code or "").strip()
        or (referral_query or "").strip()
        or (referral_subdomain or "").strip()
        or None
    )
    ref_for_stripe, bnb_for_checkout = resolve_valid_bnb_referral(db, raw_ref)
    has_bnb_checkout = bool(bnb_for_checkout)

    driver_id_snap = instance.driver_id
    driver_row: Driver | None = None
    if driver_id_snap is not None:
        driver_row = db.query(Driver).filter(Driver.id == driver_id_snap).first()
    connect_dest = (getattr(driver_row, "stripe_account_id", None) or "").strip() if driver_row else ""

    tour_id_snap = int(tour.id)
    instance_id_snap = int(instance.id)
    instance_date_iso = instance.date.isoformat()
    phone_clean = (payload.phone or "").strip() or None

    db.commit()

    try:
        return create_tour_instance_checkout_session(
            unit_amount_eur=unit_final,
            people=seats_req,
            tour_id=tour_id_snap,
            tour_instance_id=instance_id_snap,
            customer_name=payload.customer_name.strip(),
            email=payload.email.strip(),
            phone=phone_clean,
            instance_date_iso=instance_date_iso,
            has_bnb=has_bnb_checkout,
            referral_code=ref_for_stripe,
            bnb_id=bnb_for_checkout,
            driver_id=int(driver_id_snap) if driver_id_snap is not None else None,
            connect_destination_account_id=connect_dest or None,
        )
    except CheckoutSessionCreationError as e:
        code = int(getattr(e, "status_code", None) or 500)
        raise HTTPException(status_code=code, detail=e.message) from None
