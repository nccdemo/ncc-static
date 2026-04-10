"""
Trip fare split: final = base × 1.25; commissions on base; driver_amount = base.
"""

from __future__ import annotations

CUSTOMER_MARKUP = 1.25


def compute_trip_commission_fields(*, base_price: float, has_bnb: bool) -> dict:
    bp = max(0.0, round(float(base_price), 2))
    final = round(bp * CUSTOMER_MARKUP, 2)
    if has_bnb:
        bnb_c = round(bp * 0.10, 2)
        plat_c = round(bp * 0.15, 2)
    else:
        bnb_c = 0.0
        plat_c = round(bp * 0.25, 2)
    driver = round(bp, 2)
    return {
        "base_price": bp,
        "final_price": final,
        "bnb_commission": bnb_c,
        "platform_commission": plat_c,
        "driver_amount": driver,
        "has_bnb": bool(has_bnb),
    }


def resolve_booking_base_price(booking) -> float:
    """Prefer booking.base_price when set; otherwise treat booking.price as final (÷ 1.25)."""
    bp = getattr(booking, "base_price", None)
    if bp is not None and float(bp) > 0:
        return round(float(bp), 2)
    fin = float(getattr(booking, "price", 0) or 0)
    if fin <= 0:
        return 0.0
    return round(fin / CUSTOMER_MARKUP, 2)


def apply_commission_fields_to_trip(trip, booking) -> None:
    base = resolve_booking_base_price(booking)
    has_bnb = bool(getattr(booking, "has_bnb", False))
    fields = compute_trip_commission_fields(base_price=base, has_bnb=has_bnb)
    trip.base_price = fields["base_price"]
    trip.final_price = fields["final_price"]
    trip.bnb_commission = fields["bnb_commission"]
    trip.platform_commission = fields["platform_commission"]
    trip.driver_amount = fields["driver_amount"]
    trip.has_bnb = fields["has_bnb"]
    trip.price = fields["final_price"]
    fin = fields["final_price"]
    if fin and fin > 0:
        total_c = fields["bnb_commission"] + fields["platform_commission"]
        trip.commission_rate = round(total_c / fin, 6)
    else:
        trip.commission_rate = 0.2
