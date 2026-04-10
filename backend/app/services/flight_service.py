from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime

import requests
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class FlightLookupResult:
    flight_iata: str
    departure_iata: str | None
    arrival_iata: str | None
    departure_country: str | None
    scheduled_arrival: datetime | None
    estimated_arrival: datetime | None


def _parse_iso_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        # Aviationstack often returns ISO with timezone or 'Z'
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        # Ensure ETA is treated as UTC (even if tz is missing).
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        else:
            dt = dt.astimezone(ZoneInfo("UTC"))
        return dt
    except Exception:
        return None


def lookup_flight_aviationstack(flight_number: str) -> FlightLookupResult | None:
    api_key = os.getenv("AVIATIONSTACK_API_KEY")
    if not api_key:
        return None

    flight_iata = (flight_number or "").upper()
    # remove spaces and dashes
    flight_iata = flight_iata.replace(" ", "").replace("-", "")
    # remove leading zeros (e.g. FR01028 -> FR1028)
    match = re.match(r"([A-Z]+)0*(\d+)$", flight_iata)
    if match:
        flight_iata = match.group(1) + match.group(2)
    flight_iata = flight_iata.strip().upper()
    if not flight_iata:
        return None

    res = requests.get(
        "http://api.aviationstack.com/v1/flights",
        params={"access_key": api_key, "flight_iata": flight_iata},
        timeout=5,
    )
    data = res.json() if res is not None else {}
    items = data.get("data") if isinstance(data, dict) else None
    if not items:
        return None

    flight = items[0] if isinstance(items, list) else None
    if not isinstance(flight, dict):
        return None

    dep = flight.get("departure") or {}
    arr = flight.get("arrival") or {}
    if not isinstance(dep, dict):
        dep = {}
    if not isinstance(arr, dict):
        arr = {}

    scheduled = _parse_iso_dt(arr.get("scheduled"))
    estimated = _parse_iso_dt(arr.get("estimated")) or scheduled

    return FlightLookupResult(
        flight_iata=flight_iata,
        departure_iata=dep.get("iata"),
        arrival_iata=arr.get("iata"),
        departure_country=dep.get("country"),
        scheduled_arrival=scheduled,
        estimated_arrival=estimated,
    )


def normalize_flight_number(flight_number: str | None) -> str | None:
    if flight_number is None:
        return None
    return flight_number.strip().upper()
