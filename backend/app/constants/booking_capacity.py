"""Tour instance seat inventory: these statuses consume capacity until cancelled."""

HELD_BOOKING_STATUSES: tuple[str, ...] = ("pending", "paid", "confirmed")
