"""Public, unauthenticated tour instance listing."""

from datetime import date as Date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.routers.tour_instances import _instance_blocks_new_bookings, _tour_instance_public_booking_dict
from app.schemas.tour import PublicTourInstanceListItem

router = APIRouter(prefix="/public", tags=["public"])


def _format_time(instance: TourInstance) -> str | None:
    st = getattr(instance, "start_time", None)
    if st is None:
        return None
    if hasattr(st, "strftime"):
        return st.strftime("%H:%M")
    s = str(st).strip()
    return s[:5] if len(s) >= 5 else s or None


def _unit_price_eur(tour: Tour, inst: TourInstance) -> float:
    """Per-seat EUR shown to customers (matches catalog checkout markup when no instance override)."""
    raw = getattr(inst, "price", None)
    if raw is not None:
        return round(float(raw), 2)
    base = float(getattr(tour, "price", None) or 0.0)
    return round(base * 1.25, 2)


@router.get("/tour-instances", response_model=list[PublicTourInstanceListItem])
def list_public_tour_instances(db: Session = Depends(get_db)) -> list[PublicTourInstanceListItem]:
    """
    Upcoming tour instances for active tours: **date ≥ today**, **available_seats > 0**,
    and not blocked (cancelled / completed for booking).
    """
    today = Date.today()
    rows = (
        db.query(TourInstance, Tour)
        .join(Tour, Tour.id == TourInstance.tour_id)
        .options(joinedload(TourInstance.driver))
        .filter(Tour.active.is_(True), TourInstance.date >= today)
        .order_by(TourInstance.date.asc(), TourInstance.start_time.asc().nulls_last(), TourInstance.id.asc())
        .all()
    )
    out: list[PublicTourInstanceListItem] = []
    for inst, tour in rows:
        if _instance_blocks_new_bookings(inst):
            continue
        d = _tour_instance_public_booking_dict(db, inst)
        av = int(d.get("available_seats") or 0)
        if av <= 0:
            continue
        out.append(
            PublicTourInstanceListItem(
                tour_instance_id=int(inst.id),
                title=str(tour.title or ""),
                date=str(d["date"]),
                time=_format_time(inst),
                available_seats=av,
                price=_unit_price_eur(tour, inst),
                driver_name=d.get("driver_name"),
            )
        )
    return out
