"""
Aggregated calendar feed for admin: NCC trips + tour instances.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_admin
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.models.trip import Trip, TripStatus

router = APIRouter(
    prefix="/calendar",
    tags=["calendar"],
    dependencies=[Depends(require_admin)],
)

# Namespace tour instance ids so they never collide with trip ids in the UI.
_TOUR_EVENT_ID_OFFSET = 50_000_000


def _naive(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is not None:
        return dt.replace(tzinfo=None)
    return dt


def _trip_bounds(trip: Trip) -> tuple[datetime, datetime] | None:
    if trip.status in (TripStatus.CANCELLED, TripStatus.EXPIRED):
        return None
    start: datetime | None = None
    if trip.eta is not None:
        start = _naive(trip.eta)
    elif trip.service_start_time is not None:
        start = _naive(trip.service_start_time)
    elif trip.service_date is not None:
        start = datetime.combine(trip.service_date, time(9, 0))
    else:
        return None

    end: datetime | None = None
    if trip.service_end_time is not None:
        end = _naive(trip.service_end_time)
    elif trip.completed_at is not None and trip.started_at is not None:
        end = _naive(trip.completed_at)
    else:
        end = start + timedelta(hours=1)
    if end is not None and end <= start:
        end = start + timedelta(hours=1)
    if end is None:
        end = start + timedelta(hours=1)
    return start, end


def _overlaps_range(
    start: datetime, end: datetime, range_start: datetime, range_end: datetime
) -> bool:
    return start <= range_end and end >= range_start


@router.get("")
def list_calendar_events(
    db: Session = Depends(get_db),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
) -> list[dict[str, Any]]:
    """
    Return trips and tour instances as calendar blocks.
    Optional `from` / `to` (inclusive dates) default to roughly current month ± padding.
    """
    today = date.today()
    d0 = from_date or (today.replace(day=1) - timedelta(days=7))
    d1 = to_date or (today.replace(day=28) + timedelta(days=40))
    if d1 < d0:
        d0, d1 = d1, d0

    range_start = datetime.combine(d0, time.min)
    range_end = datetime.combine(d1, time(23, 59, 59))

    trips = (
        db.query(Trip)
        .filter(Trip.status.notin_((TripStatus.CANCELLED, TripStatus.EXPIRED)))
        .filter(
            or_(
                and_(Trip.service_date.isnot(None), Trip.service_date >= d0, Trip.service_date <= d1),
                and_(Trip.eta.isnot(None), Trip.eta >= range_start, Trip.eta <= range_end),
            )
        )
        .all()
    )

    out: list[dict[str, Any]] = []

    seen_trip_ids: set[int] = set()
    for t in trips:
        bounds = _trip_bounds(t)
        if bounds is None:
            continue
        ts, te = bounds
        if not _overlaps_range(ts, te, range_start, range_end):
            continue
        if int(t.id) in seen_trip_ids:
            continue
        seen_trip_ids.add(int(t.id))

        route = " → ".join(x for x in (t.pickup, t.destination) if x)
        title = f"Trip #{t.id}" + (f": {route}" if route else "")
        st = t.status.value if hasattr(t.status, "value") else str(t.status)
        title = f"{title} ({st})"

        out.append(
            {
                "id": int(t.id),
                "title": title[:200],
                "start": ts.isoformat(),
                "end": te.isoformat(),
                "driver_id": int(t.driver_id) if t.driver_id is not None else None,
            }
        )

    instances = (
        db.query(TourInstance)
        .options(joinedload(TourInstance.tour))
        .filter(TourInstance.date >= d0, TourInstance.date <= d1)
        .all()
    )

    for inst in instances:
        tour: Tour | None = getattr(inst, "tour", None)
        title_base = getattr(tour, "title", None) or f"Tour instance #{inst.id}"
        dur_h = int(getattr(tour, "duration", None) or 8)
        dur_h = max(1, min(dur_h, 24))

        ts = datetime.combine(inst.date, time(8, 0))
        te = ts + timedelta(hours=dur_h)

        did = getattr(inst, "driver_id", None)
        if did is None:
            raw = getattr(inst, "assigned_driver_ids", None)
            if isinstance(raw, list) and raw:
                try:
                    did = int(raw[0])
                except (TypeError, ValueError):
                    did = None

        out.append(
            {
                "id": _TOUR_EVENT_ID_OFFSET + int(inst.id),
                "title": f"Tour: {title_base}",
                "start": ts.isoformat(),
                "end": te.isoformat(),
                "driver_id": int(did) if did is not None else None,
            }
        )

    out.sort(key=lambda x: x["start"])
    return out
