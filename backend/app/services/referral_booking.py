from __future__ import annotations

import re
import secrets
import string

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette import status

from app.models.bnb_earning import BnbEarning
from app.models.payment import Payment
from app.models.provider import Provider

# Stored referral codes on B&B rows are 6-char A-Z0-9; allow same shape for inbound ?ref= / API.
_REFERRAL_INBOUND_RE = re.compile(r"^[A-Z0-9]{3,32}$")


def normalize_referral_code(raw: str | None) -> str | None:
    """Canonical form: trimmed ASCII upper-case, or ``None`` if missing/blank."""
    if raw is None:
        return None
    s = str(raw).strip().upper()
    return s or None


def is_valid_referral_code_format(code: str | None) -> bool:
    """True if ``code`` is normalized (uppercase) and matches allowed inbound shape."""
    if not code:
        return False
    return bool(_REFERRAL_INBOUND_RE.match(str(code).strip().upper()))


def resolve_valid_bnb_referral(db: Session, referral_code: str | None) -> tuple[str | None, int | None]:
    """
    Resolve ``?ref=`` / body referral for **bookings and checkout** only.

    - Missing or malformed → ``(None, None)`` (fallback: no referral).
    - Unknown code (no B&B row) → ``(None, None)`` — we do not persist invalid codes on bookings.

    For analytics that still need “free text” referral on payments without a provider match,
    use :func:`resolve_bnb_provider_id` instead.
    """
    code = normalize_referral_code(referral_code)
    if code is None:
        return None, None
    if not is_valid_referral_code_format(code):
        return None, None
    provider = (
        db.query(Provider)
        .filter(
            func.upper(Provider.referral_code) == code,
            func.lower(Provider.type) == "bnb",
        )
        .first()
    )
    if provider is None:
        return None, None
    return code, int(provider.id)


# B&B share of card gross when a valid referral is present (see ``marketplace_checkout_split_eur``).
BNB_REFERRAL_COMMISSION_RATE = 0.10


def increment_provider_bnb_earnings(db: Session, provider_id: int, commission_eur: float) -> None:
    """
    Add B&B commission (EUR) to ``providers.total_earnings`` after a successful card payment.
    Caller must commit. Row is locked with ``FOR UPDATE``.
    """
    amt = round(float(commission_eur or 0), 2)
    if amt <= 0:
        return
    prov = (
        db.query(Provider)
        .filter(Provider.id == int(provider_id), func.lower(Provider.type) == "bnb")
        .with_for_update()
        .first()
    )
    if prov is None:
        return
    cur = float(getattr(prov, "total_earnings", 0) or 0)
    prov.total_earnings = round(cur + amt, 2)
    db.add(prov)


def record_bnb_commission_after_payment(
    db: Session,
    *,
    payment: Payment,
    bnb_provider_id: int | None,
    commission_eur: float,
    gross_eur: float | None = None,
) -> None:
    """
    After a successful card ``Payment``: bump ``Provider.total_earnings`` and insert ``bnb_earnings``.

    Idempotent per ``payment_id`` (duplicate webhook / retry).
    """
    try:
        pk = int(bnb_provider_id) if bnb_provider_id is not None else None
    except (TypeError, ValueError):
        return
    if pk is None or pk < 1:
        return
    amt = round(float(commission_eur or 0), 2)
    if amt <= 0:
        return
    increment_provider_bnb_earnings(db, pk, amt)
    db.flush()
    pid = getattr(payment, "id", None)
    if pid is None:
        return
    try:
        bid = int(getattr(payment, "booking_id", 0) or 0)
    except (TypeError, ValueError):
        return
    if bid < 1:
        return
    gross = round(float(gross_eur if gross_eur is not None else getattr(payment, "amount", 0) or 0), 2)
    if db.query(BnbEarning.id).filter(BnbEarning.payment_id == int(pid)).first():
        return
    db.add(
        BnbEarning(
            bnb_id=pk,
            booking_id=bid,
            payment_id=int(pid),
            gross_amount_eur=gross,
            commission_eur=amt,
            commission_rate=float(BNB_REFERRAL_COMMISSION_RATE),
        )
    )


def apply_referral_to_booking(db: Session, booking: object, referral_code: str | None = None) -> None:
    """Resolve ``referral_code`` / stored code on ``booking`` and set ``bnb_id``, ``referral_code``, ``has_bnb``."""
    if booking is None or not hasattr(booking, "referral_code"):
        return
    raw = referral_code if referral_code is not None else getattr(booking, "referral_code", None)
    ref, bnb = resolve_valid_bnb_referral(db, raw)
    booking.referral_code = ref
    booking.bnb_id = bnb
    booking.has_bnb = bool(bnb)
    db.add(booking)


def resolve_bnb_provider_id(db: Session, referral_code: str | None) -> tuple[str | None, int | None]:
    """
    If ``referral_code`` matches a B&B provider row, return (normalized_code, provider.id).
    Otherwise return (normalized_code, None) so the code can still be stored for audit.
    """
    code = normalize_referral_code(referral_code)
    if code is None:
        return None, None
    provider = (
        db.query(Provider)
        .filter(
            func.upper(Provider.referral_code) == code,
            func.lower(Provider.type) == "bnb",
        )
        .first()
    )
    if provider is None:
        return code, None
    return code, int(provider.id)


_CODE_ALPHABET = string.ascii_uppercase + string.digits


def allocate_unique_bnb_referral_code(db: Session) -> str:
    """Generate a 6-character uppercase alphanumeric code unique among B&B providers."""
    for _ in range(50):
        raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        candidate = normalize_referral_code(raw) or ""
        if not candidate:
            continue
        taken = (
            db.query(Provider.id)
            .filter(func.upper(Provider.referral_code) == candidate)
            .first()
        )
        if taken is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate referral code",
    )
