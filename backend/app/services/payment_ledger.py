"""Normalize stored payment rows for reporting (platform / B&B / driver EUR)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.payment import Payment

from app.services.referral_booking import BNB_REFERRAL_COMMISSION_RATE


def marketplace_checkout_split_eur(amount_eur: float, has_bnb_id: bool) -> tuple[float, float, float]:
    """
    Card checkout gross split: with B&B referral, driver share is remainder after BNB + platform (20%).
    BNB share equals ``BNB_REFERRAL_COMMISSION_RATE`` (default 10%) — same rate stored on ``bnb_earnings``.
    Returns ``(driver_eur, bnb_eur, platform_eur)``.
    """
    a = max(0.0, float(amount_eur))
    if has_bnb_id:
        plat = round(a * 0.2, 2)
        bnb = round(a * float(BNB_REFERRAL_COMMISSION_RATE), 2)
        drv = round(a - bnb - plat, 2)
        return drv, bnb, plat
    return round(a * 0.8, 2), 0.0, round(a * 0.2, 2)


def checkout_metadata_has_bnb_id(metadata: dict, booking: Any = None) -> bool:
    """True if session metadata or booking links a B&B provider (``bnb_id`` > 0)."""
    md = metadata or {}
    raw = md.get("bnb_id")
    if raw is not None and str(raw).strip() != "":
        try:
            return int(raw) > 0
        except (TypeError, ValueError):
            pass
    if booking is not None:
        bid = getattr(booking, "bnb_id", None)
        if bid is not None:
            try:
                return int(bid) > 0
            except (TypeError, ValueError):
                pass
    return False


def platform_bnb_driver_amounts(p: "Payment") -> tuple[float, float, float]:
    """(platform_eur, bnb_eur, driver_eur); legacy rows use ``commission_amount`` as platform-only."""
    drv = float(getattr(p, "driver_amount", 0) or 0) if getattr(p, "driver_amount", None) is not None else 0.0
    pa = getattr(p, "platform_amount", None)
    ba = getattr(p, "bnb_amount", None)
    if pa is not None:
        return float(pa), float(ba or 0), drv
    ca = float(getattr(p, "commission_amount", 0) or 0)
    bnb_legacy = float(ba or 0) if ba is not None else 0.0
    if bnb_legacy > 0:
        return max(0.0, ca - bnb_legacy), bnb_legacy, drv
    return ca, 0.0, drv
