"""Driver JWT APIs: tours, tour instances, and bookings scoped to ``tours.owner_driver_id``."""

from datetime import date as Date
from datetime import datetime, time as Time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from starlette import status

from app.database import get_db
from app.deps.auth import require_driver
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.routers.tour_instances import (
    _apply_driver_ids_to_instance,
    _instance_occupies_calendar_slot,
    _raw_vehicle_capacity_from_db,
    _tour_instance_public_dict,
    compute_capacity_from_db,
    manager,
)
from app.schemas.booking import BookingResponse
from app.schemas.tour import TourResponse
from app.schemas.tour_instance import TourInstanceResponse

router = APIRouter(prefix="/driver", tags=["driver-dashboard"])


class DriverTourCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(None, max_length=20000)
    base_price: float = Field(..., gt=0)


class DriverInstanceCreate(BaseModel):
    tour_id: int = Field(..., ge=1)
    date: Date
    time: str | None = Field(
        None,
        description="Optional start time (HH:MM or HH:MM:SS)",
        max_length=12,
    )
    available_seats: int = Field(..., ge=1, le=60)


def _parse_opt_time(value: str | None) -> Time | None:
    if value is None or not str(value).strip():
        return None
    s = str(value).strip()
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid time format (use HH:MM)",
    )


def _driver_id_from_auth(auth: dict) -> int:
    return int(auth["sub"])


def _get_owned_tour_or_404(db: Session, tour_id: int, driver_id: int) -> Tour:
    tour = db.query(Tour).filter(Tour.id == tour_id).first()
    if tour is None or int(getattr(tour, "owner_driver_id", 0) or 0) != int(driver_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tour not found")
    return tour


@router.get("/me")
def driver_me(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> dict:
    did = _driver_id_from_auth(auth)
    d = db.query(Driver).filter(Driver.id == did).first()
    return {
        "driver_id": did,
        "name": getattr(d, "name", None) if d else None,
        "email": getattr(d, "email", None) if d else None,
        "role": "driver",
    }


@router.get("/tours", response_model=list[TourResponse])
def list_my_tours(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> list[Tour]:
    did = _driver_id_from_auth(auth)
    return (
        db.query(Tour)
        .filter(Tour.owner_driver_id == did, Tour.active.is_(True))
        .order_by(Tour.id.desc())
        .all()
    )


@router.post("/tours", response_model=TourResponse, status_code=status.HTTP_201_CREATED)
def create_my_tour(
    payload: DriverTourCreate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> Tour:
    did = _driver_id_from_auth(auth)
    tour = Tour(
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        price=float(payload.base_price),
        owner_driver_id=did,
        capacity=7,
        occupied_seats=0,
        images=[],
        type="tour",
        active=True,
    )
    db.add(tour)
    db.commit()
    db.refresh(tour)
    return tour


@router.get("/tour-instances", response_model=list[TourInstanceResponse])
def list_my_instances(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> list[dict]:
    did = _driver_id_from_auth(auth)
    instances = (
        db.query(TourInstance)
        .join(Tour, Tour.id == TourInstance.tour_id)
        .filter(Tour.owner_driver_id == did)
        .order_by(TourInstance.date.desc(), TourInstance.id.desc())
        .all()
    )
    return [_tour_instance_public_dict(db, ti) for ti in instances]


@router.post("/tour-instances", response_model=TourInstanceResponse, status_code=status.HTTP_201_CREATED)
def create_my_instance(
    payload: DriverInstanceCreate,
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> dict:
    driver_id = _driver_id_from_auth(auth)
    tour = _get_owned_tour_or_404(db, payload.tour_id, driver_id)

    same_day = (
        db.query(TourInstance)
        .filter(TourInstance.tour_id == payload.tour_id, TourInstance.date == payload.date)
        .all()
    )
    if any(_instance_occupies_calendar_slot(ti) for ti in same_day):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esiste già un turno per questo tour in questa data",
        )

    instance = TourInstance(
        tour_id=int(tour.id),
        date=payload.date,
        start_time=_parse_opt_time(payload.time),
        status="active",
        vehicles=0,
        capacity=0,
        vehicle_ids=[],
        available_seats=None,
    )
    db.add(instance)
    db.flush()

    _apply_driver_ids_to_instance(db, instance, [driver_id])
    db.flush()

    raw = _raw_vehicle_capacity_from_db(db, instance.id)
    if raw < 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Associa un veicolo al profilo autista prima di creare una data.",
        )

    instance.available_seats = min(int(payload.available_seats), raw)
    instance.capacity = compute_capacity_from_db(db, instance.id)
    db.add(instance)
    db.commit()
    db.refresh(instance)

    occupied = (
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(Booking.tour_instance_id == instance.id, Booking.checked_in.is_(True))
        .scalar()
        or 0
    )
    manager.broadcast_tour_instance_sync(
        instance.id,
        {
            "type": "capacity_updated",
            "capacity": int(instance.capacity or 0),
            "occupied": int(occupied),
        },
    )

    return _tour_instance_public_dict(db, instance)


@router.get("/bookings", response_model=list[BookingResponse])
def list_my_bookings(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> list[Booking]:
    driver_id = _driver_id_from_auth(auth)
    tour_ids = [
        int(t[0])
        for t in db.query(Tour.id).filter(Tour.owner_driver_id == driver_id).all()
    ]
    inst_ids = [
        int(i[0])
        for i in (
            db.query(TourInstance.id)
            .join(Tour, Tour.id == TourInstance.tour_id)
            .filter(Tour.owner_driver_id == driver_id)
            .all()
        )
    ]
    if not tour_ids and not inst_ids:
        return []

    conds = []
    if tour_ids:
        conds.append(Booking.tour_id.in_(tour_ids))
    if inst_ids:
        conds.append(Booking.tour_instance_id.in_(inst_ids))
    q = db.query(Booking).filter(or_(*conds)).order_by(Booking.id.desc())
    return q.all()
