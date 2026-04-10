"""
Server-side ride pricing split: gross (customer), platform commission, driver net.
Commission rate lives on Trip; gross prefers Trip.price then Booking.price.
"""

from __future__ import annotations

from app.models.booking import Booking
from app.models.trip import Trip

DEFAULT_COMMISSION_RATE = 0.2


def effective_commission_rate(trip: Trip | None) -> float:
    if trip is None:
        return DEFAULT_COMMISSION_RATE
    r = getattr(trip, "commission_rate", None)
    if r is None:
        return DEFAULT_COMMISSION_RATE
    return max(0.0, min(1.0, float(r)))


def ride_gross_eur(trip: Trip | None, booking: Booking | None) -> float:
    if trip is not None:
        fp = getattr(trip, "final_price", None)
        if fp is not None and float(fp) > 0:
            return float(fp)
        tp = getattr(trip, "price", None)
        if tp is not None and float(tp) > 0:
            return float(tp)
    if booking is not None:
        return float(getattr(booking, "price", 0) or 0)
    return 0.0


def split_ride_payment(*, gross_eur: float, commission_rate: float) -> tuple[float, float, float]:
    """Returns (gross, commission_amount, driver_amount)."""
    g = max(0.0, float(gross_eur))
    rate = max(0.0, min(1.0, float(commission_rate)))
    commission = round(g * rate, 2)
    driver = round(g - commission, 2)
    return g, commission, driver


def split_for_booking_and_trip(
    *,
    booking: Booking | None,
    trip: Trip | None,
    gross_override: float | None = None,
) -> tuple[float, float, float]:
    """
    gross_override: e.g. Stripe charged amount; if None, uses ride_gross_eur(trip, booking).
    No Trip: no platform commission split (full amount recorded; commission/driver left neutral).
    If Trip has driver_amount & base_price set (new commission model), returns
    (gross, bnb_commission + platform_commission, driver_amount) from the trip row.
    """
    g = float(gross_override) if gross_override is not None else ride_gross_eur(trip, booking)
    if trip is None:
        return g, 0.0, g
    drv_stored = getattr(trip, "driver_amount", None)
    base_stored = getattr(trip, "base_price", None)
    if drv_stored is not None and base_stored is not None:
        bnb = float(getattr(trip, "bnb_commission", 0) or 0)
        plat = float(getattr(trip, "platform_commission", 0) or 0)
        comm_total = round(bnb + plat, 2)
        drv = round(float(drv_stored), 2)
        return g, comm_total, drv
    rate = effective_commission_rate(trip)
    return split_ride_payment(gross_eur=g, commission_rate=rate)


def resolve_payment_split(db, payment) -> tuple[float, float, float]:
    """(gross, commission_total, driver_amount) — commission_total = platform + B&B when split columns exist."""
    gross = float(getattr(payment, "amount", 0) or 0)
    pa = getattr(payment, "platform_amount", None)
    ba = getattr(payment, "bnb_amount", None)
    da = getattr(payment, "driver_amount", None)
    if pa is not None and da is not None:
        comm_total = float(pa) + float(ba or 0)
        return gross, comm_total, float(da)
    ca = getattr(payment, "commission_amount", None)
    if ca is not None and da is not None:
        return gross, float(ca), float(da)
    b = db.query(Booking).filter(Booking.id == int(payment.booking_id)).first()
    t = None
    if b is not None and getattr(b, "trip_id", None) is not None:
        t = db.query(Trip).filter(Trip.id == int(b.trip_id)).first()
    return split_for_booking_and_trip(booking=b, trip=t, gross_override=gross)
