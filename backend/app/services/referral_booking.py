from __future__ import annotations

import re
import secrets
import string

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette import status

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
