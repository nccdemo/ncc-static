"""
After Checkout Session payment is stored, optionally move funds from the platform Stripe balance
to the driver and B&B Connect accounts (when the charge was not a Connect destination charge).

Tour instance checkouts use ``transfer_data.destination`` — the driver is already paid by Stripe;
we skip the driver ``Transfer`` in that case. B&B share is still moved via ``Transfer`` here or
by ``apply_bnb_commission_for_payment_intent`` (whichever runs first); ``bnb_commission_transfers``
keeps idempotency per PaymentIntent.
"""

from __future__ import annotations

import logging
from typing import Any

import stripe
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from stripe import StripeError

from app.models.bnb_commission_transfer import BnbCommissionTransfer
from app.models.driver import Driver
from app.models.payment import Payment
from app.models.provider import Provider

logger = logging.getLogger(__name__)


def checkout_uses_destination_charge(metadata: dict[str, Any]) -> bool:
    v = (metadata or {}).get("connect_destination_charge")
    return str(v).strip().lower() in ("1", "true", "yes")


def _eur_to_cents(eur: float) -> int:
    return max(0, int(round(float(eur) * 100)))


def _get_driver_by_id(db: Session, driver_id: int) -> Driver | None:
    return db.query(Driver).filter(Driver.id == int(driver_id)).first()


def _get_bnb_provider_by_id(db: Session, provider_id: int) -> Provider | None:
    return (
        db.query(Provider)
        .filter(Provider.id == int(provider_id), func.lower(Provider.type) == "bnb")
        .first()
    )


def _transfer_driver_share(db: Session, payment: Payment) -> None:
    if (getattr(payment, "stripe_driver_transfer_id", None) or "").strip():
        return
    did = getattr(payment, "driver_id", None)
    if did is None:
        return
    drv = _get_driver_by_id(db, int(did))
    if drv is None:
        logger.warning("Driver balance transfer skipped: driver %s not found", did)
        return
    acct = (getattr(drv, "stripe_account_id", None) or "").strip()
    if not acct:
        logger.warning("Driver balance transfer skipped: driver %s has no stripe_account_id", did)
        return
    cents = _eur_to_cents(float(payment.driver_amount or 0))
    if cents < 1:
        return
    try:
        tr = stripe.Transfer.create(
            amount=cents,
            currency="eur",
            destination=acct,
            metadata={
                "payment_id": str(payment.id),
                "booking_id": str(payment.booking_id),
                "type": "checkout_driver_share",
            },
            idempotency_key=f"checkout_driver_share_{payment.id}",
        )
        tid = str(getattr(tr, "id", "") or "").strip()
        if tid:
            payment.stripe_driver_transfer_id = tid
            db.add(payment)
            db.commit()
        print("✅ DRIVER PAID:", payment.driver_amount)
    except StripeError:
        logger.exception(
            "Stripe Transfer failed (driver checkout share payment_id=%s driver_id=%s)",
            payment.id,
            did,
        )


def _transfer_bnb_share(db: Session, payment: Payment) -> None:
    if (getattr(payment, "stripe_bnb_transfer_id", None) or "").strip():
        return
    bnb_pk = getattr(payment, "bnb_id", None)
    if bnb_pk is None:
        return
    cents = _eur_to_cents(float(payment.bnb_amount or 0))
    if cents < 1:
        return

    pi_id = (payment.stripe_payment_intent or "").strip()
    if not pi_id:
        logger.warning(
            "B&B checkout transfer skipped: no stripe_payment_intent on payment %s (wait for PI webhook)",
            payment.id,
        )
        return

    existing = (
        db.query(BnbCommissionTransfer)
        .filter(BnbCommissionTransfer.stripe_payment_intent_id == pi_id)
        .first()
    )
    if existing is not None:
        payment.stripe_bnb_transfer_id = existing.stripe_transfer_id
        db.add(payment)
        db.commit()
        logger.info(
            "B&B commission already recorded for pi=%s (payment %s); linked transfer id",
            pi_id,
            payment.id,
        )
        return

    prov = _get_bnb_provider_by_id(db, int(bnb_pk))
    if prov is None:
        logger.warning("B&B balance transfer skipped: provider %s not found or not bnb", bnb_pk)
        return
    acct = (getattr(prov, "stripe_account_id", None) or "").strip()
    if not acct:
        logger.warning(
            "B&B balance transfer skipped: provider %s has no stripe_account_id",
            bnb_pk,
        )
        return

    try:
        tr = stripe.Transfer.create(
            amount=cents,
            currency="eur",
            destination=acct,
            metadata={
                "payment_id": str(payment.id),
                "booking_id": str(payment.booking_id),
                "bnb_id": str(bnb_pk),
                "type": "checkout_bnb_share",
            },
            idempotency_key=f"checkout_bnb_share_{payment.id}",
        )
        tid = str(getattr(tr, "id", "") or "").strip()
        if not tid:
            logger.error("B&B Transfer returned no id (payment %s)", payment.id)
            return
        payment.stripe_bnb_transfer_id = tid
        db.add(payment)
        db.add(
            BnbCommissionTransfer(
                stripe_payment_intent_id=pi_id,
                stripe_transfer_id=tid,
                booking_id=int(payment.booking_id),
                bnb_provider_id=int(bnb_pk),
                amount_cents=cents,
            )
        )
        db.commit()
        print("✅ BNB PAID:", payment.bnb_amount)
    except IntegrityError:
        db.rollback()
        logger.info(
            "B&B commission row already exists for payment %s (concurrent webhook); skipping",
            payment.id,
        )
    except StripeError:
        db.rollback()
        logger.exception(
            "Stripe Transfer failed (B&B checkout share payment_id=%s bnb_id=%s)",
            payment.id,
            bnb_pk,
        )


def run_post_checkout_balance_transfers(
    db: Session,
    payment: Payment,
    metadata: dict[str, Any],
) -> None:
    """Run after ``payments`` row is committed and refreshed (has ``id``)."""
    if not stripe.api_key:
        return
    db.refresh(payment)

    if checkout_uses_destination_charge(metadata):
        logger.info(
            "Skipping driver balance Transfer (Connect destination charge) payment_id=%s",
            payment.id,
        )
    else:
        try:
            _transfer_driver_share(db, payment)
        except Exception:
            logger.exception("Unexpected error in driver balance transfer payment_id=%s", payment.id)

    try:
        _transfer_bnb_share(db, payment)
    except Exception:
        logger.exception("Unexpected error in B&B balance transfer payment_id=%s", payment.id)
