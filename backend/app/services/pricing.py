from __future__ import annotations

import math
import os
from typing import Tuple


BASE_FARE: float = 10.0
PRICE_PER_KM: float = 1.5
EARTH_RADIUS_KM: float = 6371.0


def _deg2rad(deg: float) -> float:
    return deg * math.pi / 180.0


def haversine_km(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
) -> float:
    """
    Great-circle distance between two WGS84 coordinates, in kilometers.
    """
    lat1 = _deg2rad(float(pickup_lat))
    lon1 = _deg2rad(float(pickup_lng))
    lat2 = _deg2rad(float(dropoff_lat))
    lon2 = _deg2rad(float(dropoff_lng))

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def calculate_price(
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
) -> Tuple[float, float]:
    """
    Calculate ride price based on distance using a simple Uber-style formula.

    Returns (price, distance_km), with price rounded to 2 decimals.

    Safety fallback:
    - If any coordinate is missing or invalid, returns (BASE_FARE, 0.0).
    """
    # Fallback: incomplete coordinates → base fare only.
    if (
        pickup_lat is None
        or pickup_lng is None
        or dropoff_lat is None
        or dropoff_lng is None
    ):
        price = round(float(BASE_FARE), 2)
        distance_km = 0.0
    else:
        try:
            distance_km = float(haversine_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng))
        except (TypeError, ValueError, OverflowError):
            # Defensive: any math/typing issue falls back to base fare.
            price = round(float(BASE_FARE), 2)
            distance_km = 0.0
        else:
            raw_price = BASE_FARE + (distance_km * PRICE_PER_KM)
            price = round(float(raw_price), 2)

    # Dev-only debug log (noisy but useful when tuning pricing).
    env = os.getenv("ENV", "").lower()
    if env in ("dev", "development", "debug"):
        try:
            print(f"[pricing] Distance: {distance_km:.3f} km - Price: €{price:.2f}")
        except Exception:
            # Never break business logic because of logging issues.
            pass

    return price, float(distance_km)


