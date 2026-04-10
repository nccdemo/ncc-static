from datetime import date as Date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_admin_or_driver_self
from app.models.driver import Driver
from app.models.driver_schedule import DriverSchedule
from app.models.driver_work_log import DriverWorkLog
from app.models.tour_instance import TourInstance
from app.models.trip import Trip

router = APIRouter(prefix="/drivers", tags=["driver-accounting"])


def _driver_matches_tour_instance(inst: TourInstance, driver_id: int) -> bool:
    if getattr(inst, "driver_id", None) == driver_id:
        return True
    raw = getattr(inst, "assigned_driver_ids", None) or []
    if not isinstance(raw, list):
        return False
    try:
        return driver_id in [int(x) for x in raw]
    except (TypeError, ValueError):
        return False


def _tour_payload(inst: TourInstance | None) -> dict[str, Any] | None:
    if inst is None:
        return None
    tour = getattr(inst, "tour", None)
    title = getattr(tour, "title", None) if tour is not None else None
    return {
        "instance_id": int(inst.id),
        "tour_id": int(inst.tour_id),
        "title": title,
        "instance_date": inst.date.isoformat() if getattr(inst, "date", None) else None,
        "instance_status": str(inst.status or ""),
        "vehicle_name": getattr(inst, "vehicle_name", None),
    }


def _trip_payload(trip: Trip | None) -> dict[str, Any] | None:
    if trip is None:
        return None
    st = trip.status
    st_s = str(st.value if hasattr(st, "value") else st).lower()
    return {
        "id": int(trip.id),
        "pickup": getattr(trip, "pickup", None),
        "destination": getattr(trip, "destination", None),
        "status": st_s,
    }


def _resolve_tour_instance(row: DriverSchedule) -> TourInstance | None:
    if row.tour_instance is not None:
        return row.tour_instance
    trip = row.trip
    if trip is not None and trip.tour_instance is not None:
        return trip.tour_instance
    return None


def _serialize_schedule_row(row: DriverSchedule) -> dict[str, Any]:
    ti = _resolve_tour_instance(row)
    return {
        "id": int(row.id),
        "date": row.date.isoformat() if row.date else None,
        "start_time": row.start_time.strftime("%H:%M") if row.start_time else None,
        "end_time": row.end_time.strftime("%H:%M") if row.end_time else None,
        "status": str(row.status or ""),
        "trip_id": int(row.trip_id) if row.trip_id is not None else None,
        "tour_instance_id": int(row.tour_instance_id) if row.tour_instance_id is not None else None,
        "trip": _trip_payload(row.trip),
        "tour": _tour_payload(ti),
        "source": "schedule",
    }


def _serialize_instance_only(inst: TourInstance) -> dict[str, Any]:
    """Synthetic row when driver is on instance but no driver_schedules row yet."""
    return {
        "id": -int(inst.id),
        "date": inst.date.isoformat() if inst.date else None,
        "start_time": None,
        "end_time": None,
        "status": "tour_instance",
        "trip_id": None,
        "tour_instance_id": int(inst.id),
        "trip": None,
        "tour": _tour_payload(inst),
        "source": "tour_instance",
    }


@router.get("/{driver_id}/schedule")
def driver_schedule(
    driver_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_admin_or_driver_self),
) -> dict:
    did = int(driver_id)
    driver = db.query(Driver).filter(Driver.id == did).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    rows = (
        db.query(DriverSchedule)
        .options(
            joinedload(DriverSchedule.trip).joinedload(Trip.tour_instance).joinedload(
                TourInstance.tour
            ),
            joinedload(DriverSchedule.tour_instance).joinedload(TourInstance.tour),
        )
        .filter(DriverSchedule.driver_id == did)
        .order_by(DriverSchedule.date.asc(), DriverSchedule.start_time.asc().nulls_last())
        .all()
    )

    items: list[dict[str, Any]] = [_serialize_schedule_row(r) for r in rows]

    covered_instance_ids: set[int] = set()
    for r in rows:
        if r.tour_instance_id is not None:
            covered_instance_ids.add(int(r.tour_instance_id))
        elif r.trip is not None and getattr(r.trip, "tour_instance_id", None) is not None:
            covered_instance_ids.add(int(r.trip.tour_instance_id))

    cutoff = Date.today() - timedelta(days=14)
    instances = (
        db.query(TourInstance)
        .options(joinedload(TourInstance.tour))
        .filter(TourInstance.date >= cutoff)
        .order_by(TourInstance.date.asc(), TourInstance.id.asc())
        .all()
    )
    for inst in instances:
        if not _driver_matches_tour_instance(inst, did):
            continue
        if int(inst.id) in covered_instance_ids:
            continue
        items.append(_serialize_instance_only(inst))

    def _sort_key(x: dict[str, Any]) -> tuple[str, str, int]:
        d = str(x.get("date") or "")
        t = str(x.get("start_time") or "99:99")
        sid = int(x.get("id") or 0)
        return (d, t, sid)

    items.sort(key=_sort_key)

    return {"items": items}


@router.get("/{driver_id}/work-summary")
def driver_work_summary(
    driver_id: int,
    db: Session = Depends(get_db),
    _auth: dict = Depends(require_admin_or_driver_self),
) -> dict:
    driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    logs = (
        db.query(DriverWorkLog)
        .filter(DriverWorkLog.driver_id == int(driver_id))
        .order_by(DriverWorkLog.date.desc())
        .all()
    )
    days_worked = len(logs)
    total_rides = sum(int(l.rides_count or 0) for l in logs)
    total_amount = sum(float(l.total_amount or 0.0) for l in logs)

    return {
        "days_worked": int(days_worked),
        "total_rides": int(total_rides),
        "total_amount": float(total_amount),
        "days": [
            {
                "date": l.date.isoformat() if isinstance(l.date, Date) else str(l.date),
                "rides_count": int(l.rides_count or 0),
                "total_amount": float(l.total_amount or 0.0),
            }
            for l in logs
        ],
    }
