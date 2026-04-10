import logging
from typing import Any

import requests
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import NOMINATIM_USER_AGENT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/geocoding", tags=["geocoding"])

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"


class GeocodeSuggestion(BaseModel):
    label: str
    lat: float
    lng: float


def _nominatim_headers() -> dict[str, str]:
    # https://operations.osmfoundation.org/policies/nominatim/ — valid User-Agent required.
    ua = (NOMINATIM_USER_AGENT or "").strip() or "NCC-Backend/1.0"
    return {"User-Agent": ua, "Accept": "application/json"}


def _nominatim_search(q: str) -> list[dict[str, Any]]:
    query = (q or "").strip()
    if len(query) < 1:
        return []
    try:
        resp = requests.get(
            NOMINATIM_SEARCH_URL,
            params={"q": query, "format": "json", "limit": 5},
            headers=_nominatim_headers(),
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        logger.exception("Nominatim search request failed")
        return []

    if not isinstance(data, list):
        return []

    out: list[dict[str, Any]] = []
    for row in data:
        label = row.get("display_name")
        lat_s = row.get("lat")
        lon_s = row.get("lon")
        if not label or lat_s is None or lon_s is None:
            continue
        try:
            lat = float(lat_s)
            lng = float(lon_s)
        except (TypeError, ValueError):
            continue
        out.append({"label": str(label), "lat": lat, "lng": lng})
    return out


@router.get("/search", response_model=list[GeocodeSuggestion])
def geocoding_search(q: str = "") -> list[GeocodeSuggestion]:
    """Proxy: OpenStreetMap Nominatim search (free); no API key."""
    try:
        rows = _nominatim_search(q)
        return [GeocodeSuggestion(**row) for row in rows]
    except Exception:
        logger.exception("geocoding_search failed")
        return []
