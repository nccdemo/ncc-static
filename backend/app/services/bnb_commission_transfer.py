"""Stripe Connect transfers for B&B referral commission (payment_intent.succeeded)."""

from __future__ import annotations

import logging
import os
from typing import Any

import stripe
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.bnb_commission_transfer import BnbCommissionTransfer
from app.models.booking import Booking
from app.models.provider import Provider

logger = logging.getLogger(__name__)


def _bnb_commission_rate() -> float:
    raw = (os.getenv("STRIPE_BNB_COMMISSION_RATE") or "0.1").strip()
    try:
        r = float(raw)
    except ValueError:
        return 0.1
    return min(1.0, max(0.0, r))


def _parse_bnb_provider_id(metadata: dict[str, Any], db: Session) -> int | None:
    raw = metadata.get("bnb_id")
    if raw is not None and str(raw).strip() != "":
        try:
            n = int(raw)
            return n if n > 0 else None
        except (TypeError, ValueError):
            pass

    bid = metadata.get("booking_id")
    if bid is not None and str(bid).strip() != "":
        try:
            booking = db.query(Booking).filter(Booking.id == int(bid)).first()
            if booking is not None and getattr(booking, "bnb_id", None):
                return int(booking.bnb_id)
        except (TypeError, ValueError):
            pass
    return None


def apply_bnb_commission_for_payment_intent(db: Session, intent_obj: dict[str, Any]) -> None:
    """
    If the PaymentIntent carries a B&B referral (bnb_id or booking.bnb_id), transfer
    a commission to the provider's Connect account. No-op when no bnb or no stripe_account_id.
    Idempotent: DB row per payment_intent_id + Stripe idempotency key bnb_commission_<pi_id>.
    """
    if not stripe.api_key:
        return

    pi_id = str(intent_obj.get("id") or "").strip()
    if not pi_id:
        return

    exists = (
        db.query(BnbCommissionTransfer)
        .filter(BnbCommissionTransfer.stripe_payment_intent_id == pi_id)
        .first()
    )
    if exists is not None:
        return

    md_raw = intent_obj.get("metadata") or {}
    metadata: dict[str, Any] = dict(md_raw) if isinstance(md_raw, dict) else {}

    bnb_id = _parse_bnb_provider_id(metadata, db)
    if bnb_id is None:
        return

    provider = (
        db.query(Provider)
        .filter(Provider.id == int(bnb_id), func.lower(Provider.type) == "bnb")
        .first()
    )
    if provider is None:
        logger.warning("B&B commission skipped: provider %s not found or not type bnb", bnb_id)
        return

    dest = (getattr(provider, "stripe_account_id", None) or "").strip()
    if not dest:
        logger.warning(
            "B&B commission skipped: provider %s has no stripe_account_id",
            bnb_id,
        )
        return

    amount_cents = int(intent_obj.get("amount_received") or intent_obj.get("amount") or 0)
    if amount_cents <= 0:
        return

    raw_transfer = metadata.get("bnb_transfer_cents")
    commission_cents: int
    if raw_transfer is not None and str(raw_transfer).strip() != "":
        try:
            commission_cents = int(raw_transfer)
        except (TypeError, ValueError):
            rate = _bnb_commission_rate()
            commission_cents = int(round(amount_cents * rate))
    else:
        rate = _bnb_commission_rate()
        commission_cents = int(round(amount_cents * rate))
    commission_cents = max(0, min(commission_cents, amount_cents))
    if commission_cents < 1:
        return

    booking_id_meta = metadata.get("booking_id")
    booking_id_int: int | None = None
    if booking_id_meta is not None and str(booking_id_meta).strip() != "":
        try:
            booking_id_int = int(booking_id_meta)
        except (TypeError, ValueError):
            booking_id_int = None

    idempotency_key = f"bnb_commission_{pi_id}"
    try:
        transfer = stripe.Transfer.create(
            amount=commission_cents,
            currency="eur",
            destination=dest,
            metadata={
                "booking_id": str(booking_id_int) if booking_id_int is not None else "",
                "bnb_id": str(bnb_id),
                "type": "bnb_commission",
            },
            idempotency_key=idempotency_key,
        )
    except stripe.StripeError:
        logger.exception("Stripe Transfer failed for B&B commission (pi=%s)", pi_id)
        return

    tid = str(getattr(transfer, "id", "") or "")
    if not tid:
        logger.error("B&B commission: no transfer id from Stripe (pi=%s)", pi_id)
        return

    db.add(
        BnbCommissionTransfer(
            stripe_payment_intent_id=pi_id,
            stripe_transfer_id=tid,
            booking_id=booking_id_int,
            bnb_provider_id=int(bnb_id),
            amount_cents=int(commission_cents),
        )
    )
