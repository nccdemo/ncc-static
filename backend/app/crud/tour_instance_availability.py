"""
Tour instance availability for PostgreSQL.

Capacity = SUM(vehicles.seats * tour_instance_vehicles.quantity) per instance.
Booked = SUM(bookings.people) where status IN ('pending','paid','confirmed') (column `people`, not `seats`).

Uses separate aggregations (CTEs) so vehicle capacity is not multiplied by booking rows
(which would happen with a single LEFT JOIN of tiv and bookings).
"""

from datetime import date as DateType
from datetime import datetime, time

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.tour_instance_vehicle import TourInstanceVehicle
from app.models.vehicle import Vehicle

_TOUR_INSTANCE_AVAILABILITY_SQL = text(
    """
    WITH cap AS (
        SELECT tiv.tour_instance_id,
               LEAST(
                   COALESCE(SUM(v.seats * tiv.quantity), 0)::bigint,
                   COALESCE(MAX(ti.available_seats), 999999)::bigint
               ) AS capacity
        FROM tour_instance_vehicles AS tiv
        INNER JOIN vehicles AS v ON v.id = tiv.vehicle_id
        INNER JOIN tour_instances AS ti ON ti.id = tiv.tour_instance_id
        GROUP BY tiv.tour_instance_id
    ),
    book AS (
        SELECT tour_instance_id,
               COALESCE(SUM(people), 0)::bigint AS booked
        FROM bookings
        WHERE LOWER(TRIM(status)) IN ('pending', 'paid', 'confirmed')
        GROUP BY tour_instance_id
    )
    SELECT
        ti.id,
        ti.tour_id,
        ti.date,
        ti.start_time,
        ti.status,
        COALESCE(cap.capacity, 0)::bigint AS capacity,
        COALESCE(book.booked, 0)::bigint AS booked,
        (COALESCE(cap.capacity, 0) - COALESCE(book.booked, 0))::bigint AS available
    FROM tour_instances AS ti
    LEFT JOIN cap ON cap.tour_instance_id = ti.id
    LEFT JOIN book ON book.tour_instance_id = ti.id
    WHERE ti.tour_id = :tour_id
    ORDER BY ti.id
    """
)


def _vehicles_for_instance(db: Session, instance_id: int) -> list[dict]:
    rows = (
        db.query(TourInstanceVehicle, Vehicle)
        .join(Vehicle, Vehicle.id == TourInstanceVehicle.vehicle_id)
        .filter(TourInstanceVehicle.tour_instance_id == instance_id)
        .all()
    )
    return [
        {
            "vehicle_id": int(tiv.vehicle_id),
            "name": str(vehicle.name or f"Vehicle #{vehicle.id}"),
            "seats": int(vehicle.seats or 0),
            "quantity": int(tiv.quantity or 0),
        }
        for tiv, vehicle in rows
    ]


def _instance_starts_at_iso(d) -> str | None:
    """Turn stored DATE into ISO datetime (midnight) for API consumers."""
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.isoformat(timespec="seconds")
    if isinstance(d, DateType):
        return datetime.combine(d, time.min).isoformat(timespec="seconds")
    try:
        if hasattr(d, "isoformat"):
            # e.g. string already
            s = d.isoformat()
            if len(s) == 10 and s[4] == "-":
                return f"{s}T00:00:00"
            return str(s)
    except Exception:
        pass
    return str(d)


def load_tour_instance_availability(db: Session, tour_id: int) -> list[dict]:
    rows = db.execute(_TOUR_INSTANCE_AVAILABILITY_SQL, {"tour_id": tour_id}).mappings().all()
    out: list[dict] = []
    for r in rows:
        d = r["date"]
        tid = int(r["tour_id"])
        status = r["status"] if r["status"] is not None else "active"
        iid = int(r["id"])
        cap = int(r["capacity"] or 0)
        booked = int(r["booked"] or 0)
        avail = int(r["available"] or 0)
        st = str(status).strip().lower()
        if st == "cancelled":
            avail = 0
        vehicles = _vehicles_for_instance(db, iid)
        date_iso = _instance_starts_at_iso(d)
        raw_time = r.get("start_time")
        start_time_str = None
        if raw_time is not None:
            if hasattr(raw_time, "isoformat"):
                start_time_str = raw_time.isoformat(timespec="minutes")
            else:
                s = str(raw_time).strip()
                start_time_str = s[:5] if len(s) >= 5 and s[2] == ":" else s
        out.append(
            {
                "id": iid,
                "tour_id": tid,
                "date": date_iso,
                "start_time": start_time_str,
                "status": str(status),
                "capacity": cap,
                "booked": booked,
                "available": avail,
                "total_seats": cap,
                "available_seats": max(0, avail),
                "vehicles": vehicles,
            }
        )
    return out
