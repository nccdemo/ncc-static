from __future__ import annotations

import time
from typing import Any

import requests
from sqlalchemy.orm import Session

from app.config import NOMINATIM_USER_AGENT
from app.models.booking import Booking


NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search"

# Targeted aliases to improve common inputs (especially airports).
AIRPORT_ALIASES: dict[str, str] = {
    "aeroporto di palermo": "Falcone Borsellino Airport",
    "aeroporto palermo": "Falcone Borsellino Airport",
    "palermo aeroporto": "Falcone Borsellino Airport",
    "pmo": "Falcone Borsellino Airport",
}


def normalize_address(address: str) -> str:
    key = (address or "").lower().strip()
    if not key:
        return ""
    return AIRPORT_ALIASES.get(key, address.strip())


def _with_geo_context(address: str) -> str:
    """
    Add geographic context to improve Nominatim results for ambiguous queries.
    """
    a = (address or "").strip()
    if not a:
        return ""
    # Keep it simple and consistent with current SaaS market.
    return f"{a}, Sicily, Italy"


def _nominatim_geocode(address: str) -> tuple[float, float] | None:
    """
    Low-level Nominatim call. Returns (lat, lng) or None.

    IMPORTANT: Nominatim requires a valid User-Agent identifying the application.
    """
    q_raw = (address or "").strip()
    q_norm = normalize_address(q_raw)
    q = _with_geo_context(q_norm)
    if not q:
        return None

    try:
        # Gentle delay in case multiple requests happen in a row (best-effort).
        time.sleep(0.1)
        res = requests.get(
            NOMINATIM_BASE,
            params={"q": q, "format": "json", "limit": 1},
            headers={"User-Agent": NOMINATIM_USER_AGENT, "Accept": "application/json"},
            timeout=8,
        )
        res.raise_for_status()
        data: Any = res.json()
        if not isinstance(data, list) or not data:
            return None
        first = data[0] if isinstance(data[0], dict) else None
        if not first:
            return None
        lat = float(first.get("lat"))
        lng = float(first.get("lon"))
        return lat, lng
    except Exception as e:
        print("GEOCODING ERROR:", q_raw, "=>", q, str(e))
        return None


def geocode_address(address: str) -> tuple[float, float] | None:
    """
    Backwards-compatible helper kept for simple callers.
    Uses Nominatim without DB-backed caching.
    """
    return _nominatim_geocode(address)


def geocode_address_for_booking(
    db: Session,
    *,
    booking: Booking,
) -> tuple[float | None, float | None, float | None, float | None]:
    """
    High-level helper: best-effort geocoding for a booking's pickup/destination.

    - Reuses stored coordinates on `booking` when present.
    - Calls Nominatim only for missing coordinates.
    - Persists any newly found coordinates back on the booking.
    """
    pickup_lat = getattr(booking, "pickup_latitude", None)
    pickup_lng = getattr(booking, "pickup_longitude", None)
    dest_lat = getattr(booking, "dropoff_latitude", None)
    dest_lng = getattr(booking, "dropoff_longitude", None)

    pickup_text = (getattr(booking, "pickup", None) or "").strip()
    dest_text = (getattr(booking, "destination", None) or "").strip()

    try:
        if pickup_text and (pickup_lat is None or pickup_lng is None):
            g = _nominatim_geocode(pickup_text)
            if g is not None:
                glat, glng = g
                pickup_lat, pickup_lng = float(glat), float(glng)
                booking.pickup_latitude = pickup_lat
                booking.pickup_longitude = pickup_lng

        if dest_text and (dest_lat is None or dest_lng is None):
            g = _nominatim_geocode(dest_text)
            if g is not None:
                glat, glng = g
                dest_lat, dest_lng = float(glat), float(glng)
                booking.dropoff_latitude = dest_lat
                booking.dropoff_longitude = dest_lng
    except Exception as e:
        print("Geocoding error (booking):", str(e))

    try:
        db.flush()
    except Exception:
        # Best-effort: do not break the caller if flush fails.
        db.rollback()

    return pickup_lat, pickup_lng, dest_lat, dest_lng

