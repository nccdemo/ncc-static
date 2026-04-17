import os
from pathlib import Path
from datetime import date as Date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.constants.booking_capacity import HELD_BOOKING_STATUSES
from app.database import get_db
from app.deps.auth import require_admin
from app.models.booking import Booking
from app.models.bnb_commission_transfer import BnbCommissionTransfer
from app.models.driver import Driver
from app.models.driver_schedule import DriverSchedule
from app.models.payment import Payment
from app.models.quote import Quote
from app.models.service_log import ServiceLog
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.models.tour_instance_vehicle import TourInstanceVehicle
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.schemas.tour import TourInstanceCatalogItem, TourInstancePublicBookingResponse
from app.schemas.tour_instance import TourInstanceResponse
from app.services.trip_service import TripService
from app.services.websocket_manager import manager

try:
    from weasyprint import HTML  # type: ignore

    PDF_ENABLED = True
except Exception:
    HTML = None  # type: ignore
    PDF_ENABLED = False

router = APIRouter(
    prefix="/tour-instances",
    tags=["tour-instances"],
)


def _instance_status_lower(instance: TourInstance | None) -> str:
    return str(getattr(instance, "status", None) or "").strip().lower()


def _instance_blocks_new_bookings(instance: TourInstance) -> bool:
    """True if customers should not book or pay for this instance."""
    st = _instance_status_lower(instance)
    return st in ("cancelled", "completed")


def _instance_occupies_calendar_slot(instance: TourInstance) -> bool:
    """Same calendar date cannot be reused while this instance still occupies the slot."""
    st = _instance_status_lower(instance)
    if st == "scheduled":
        return True
    return st not in ("cancelled",)


class AssignRequest(BaseModel):
    driver_id: int
    vehicle_ids: list[int]


class TourInstanceVehicleItem(BaseModel):
    vehicle_id: int
    quantity: int = 1


class TourInstanceCreateRequest(BaseModel):
    tour_id: int
    date: Date
    status: str = "active"
    vehicles: list[TourInstanceVehicleItem] | None = None
    driver_ids: list[int] | None = None


class TourInstanceUpdateRequest(BaseModel):
    tour_id: int | None = None
    date: Date | None = None
    status: str | None = None
    vehicles: list[TourInstanceVehicleItem] | None = None
    driver_ids: list[int] | None = None


class AssignVehiclesRequest(BaseModel):
    vehicles: list[TourInstanceVehicleItem]


def compute_instance_capacity(instance: TourInstance) -> int:
    if not getattr(instance, "_vehicle_rows", None):
        return 0
    return max(0, int(sum(int(r["seats"]) * int(r["quantity"]) for r in instance._vehicle_rows)))


def load_instance_vehicle_rows(db: Session, instance_id: int) -> list[dict]:
    rows = (
        db.query(TourInstanceVehicle, Vehicle)
        .join(Vehicle, Vehicle.id == TourInstanceVehicle.vehicle_id)
        .filter(TourInstanceVehicle.tour_instance_id == instance_id)
        .all()
    )
    return [
        {
            "vehicle_id": tiv.vehicle_id,
            "vehicle_name": vehicle.name,
            "seats": int(vehicle.seats),
            "quantity": int(tiv.quantity),
        }
        for tiv, vehicle in rows
    ]


def _raw_vehicle_capacity_from_db(db: Session, instance_id: int) -> int:
    rows = load_instance_vehicle_rows(db, instance_id)
    if not rows:
        return 0
    return int(sum(int(r["seats"]) * int(r["quantity"]) for r in rows))


def compute_capacity_from_db(db: Session, instance_id: int) -> int:
    raw = _raw_vehicle_capacity_from_db(db, instance_id)
    inst = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if inst is None:
        return raw
    cap = getattr(inst, "available_seats", None)
    if cap is not None:
        return min(raw, int(cap))
    return raw


def _driver_ids_for_response(instance: TourInstance) -> list[int]:
    raw = getattr(instance, "assigned_driver_ids", None)
    if isinstance(raw, list) and len(raw) > 0:
        return [int(x) for x in raw]
    if instance.driver_id:
        return [int(instance.driver_id)]
    return []


def _tour_instance_public_dict(db: Session, instance: TourInstance) -> dict:
    capacity = compute_capacity_from_db(db, instance.id)
    booked = (
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(Booking.tour_instance_id == instance.id, Booking.status.in_(HELD_BOOKING_STATUSES))
        .scalar()
        or 0
    )
    available = max(0, int(capacity) - int(booked))
    if _instance_status_lower(instance) == "cancelled":
        available = 0
    vrows = load_instance_vehicle_rows(db, instance.id)
    vehicles = [
        {
            "vehicle_id": r["vehicle_id"],
            "name": r["vehicle_name"],
            "seats": r["seats"],
            "quantity": r["quantity"],
        }
        for r in vrows
    ]
    primary_vehicle = _primary_vehicle_dict_for_instance(db, instance)
    drv = getattr(instance, "driver", None)
    driver_name = getattr(drv, "name", None) if drv is not None else getattr(instance, "driver_name", None)
    vehicle_plate = primary_vehicle.get("plate") if isinstance(primary_vehicle, dict) else None
    vehicle_name = primary_vehicle.get("name") if isinstance(primary_vehicle, dict) else getattr(instance, "vehicle_name", None)

    st = getattr(instance, "start_time", None)
    start_time_str = None
    if st is not None and hasattr(st, "isoformat"):
        try:
            start_time_str = st.isoformat(timespec="minutes")
        except TypeError:
            start_time_str = str(st)

    return {
        "id": instance.id,
        "tour_id": instance.tour_id,
        "date": instance.date.isoformat(),
        "start_time": start_time_str,
        "status": instance.status,
        "capacity": int(capacity),
        "booked": int(booked),
        "available": int(available),
        "total_seats": int(capacity),
        "available_seats": int(available),
        "driver_id": instance.driver_id,
        "driver_ids": _driver_ids_for_response(instance),
        "driver_name": driver_name,
        "vehicle_name": vehicle_name,
        "vehicle_plate": vehicle_plate,
        "vehicle_ids": instance.vehicle_ids or [],
        "vehicles": vehicles,
        "vehicle": primary_vehicle,
    }


def _replace_instance_vehicles(
    db: Session,
    instance: TourInstance,
    items: list[TourInstanceVehicleItem],
) -> None:
    instance_id = instance.id
    db.query(TourInstanceVehicle).filter(TourInstanceVehicle.tour_instance_id == instance_id).delete()
    if not items:
        instance.vehicle_ids = []
        instance.vehicle_name = None
        instance.capacity = 0
        return
    assigned_ids: list[int] = []
    names: list[str] = []
    for item in items:
        if item.quantity < 1:
            raise HTTPException(status_code=400, detail="quantity must be >= 1")
        vehicle = db.query(Vehicle).filter(Vehicle.id == item.vehicle_id, Vehicle.active.is_(True)).first()
        if vehicle is None:
            raise HTTPException(status_code=404, detail=f"Vehicle {item.vehicle_id} not found")
        db.add(
            TourInstanceVehicle(
                tour_instance_id=instance_id,
                vehicle_id=vehicle.id,
                quantity=item.quantity,
            )
        )
        assigned_ids.append(vehicle.id)
        names.append(vehicle.name)
    db.flush()
    instance.vehicle_ids = assigned_ids
    instance.vehicle_name = ", ".join(names) if names else None
    instance.capacity = compute_capacity_from_db(db, instance_id)


def _apply_driver_ids_to_instance(
    db: Session,
    instance: TourInstance,
    driver_ids: list[int],
) -> None:
    if not driver_ids:
        instance.driver_id = None
        instance.driver_name = None
        instance.assigned_driver_ids = []
        return
    names: list[str] = []
    primary: Driver | None = None
    stored_ids: list[int] = []
    for did in driver_ids:
        driver = db.query(Driver).filter(Driver.id == did, Driver.is_active.is_(True)).first()
        if driver is None:
            raise HTTPException(status_code=404, detail=f"Driver {did} not found")
        stored_ids.append(int(driver.id))
        names.append(driver.name or "")
        if primary is None:
            primary = driver
    instance.driver_id = primary.id
    instance.driver_name = ", ".join(n for n in names if n)
    instance.assigned_driver_ids = stored_ids
    has_tiv = (
        db.query(TourInstanceVehicle)
        .filter(TourInstanceVehicle.tour_instance_id == instance.id)
        .count()
        > 0
    )
    if not has_tiv:
        dv = TripService.resolve_vehicle_id_for_driver(db, int(primary.id))
        if dv is not None:
            _sync_driver_vehicle_into_instance(db, instance, int(dv))


def _confirmed_booked_people(db: Session, instance_id: int) -> int:
    """Seats held (pending + paid + confirmed)."""
    return int(
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(Booking.tour_instance_id == instance_id, Booking.status.in_(HELD_BOOKING_STATUSES))
        .scalar()
        or 0
    )


def _sync_driver_vehicle_into_instance(db: Session, instance: TourInstance, vehicle_id: int) -> None:
    """
    Persist the driver's default vehicle in tour_instance_vehicles (not only JSON vehicle_ids),
    so capacity, availability, and vehicles[] in API responses stay correct.
    """
    v = db.query(Vehicle).filter(Vehicle.id == int(vehicle_id)).first()
    if v is None or not bool(getattr(v, "active", True)):
        return
    db.query(TourInstanceVehicle).filter(TourInstanceVehicle.tour_instance_id == instance.id).delete()
    db.flush()
    db.add(
        TourInstanceVehicle(
            tour_instance_id=int(instance.id),
            vehicle_id=int(vehicle_id),
            quantity=1,
        )
    )
    instance.vehicle_ids = [int(vehicle_id)]
    instance.vehicle_name = str(v.name or "")


def _primary_vehicle_dict_for_instance(db: Session, instance: TourInstance) -> dict | None:
    """Single vehicle summary for UIs: first fleet row, else driver's resolved vehicle."""
    vrows = load_instance_vehicle_rows(db, instance.id)
    vid: int | None = None
    if vrows:
        vid = int(vrows[0]["vehicle_id"])
    elif instance.driver_id:
        resolved = TripService.resolve_vehicle_id_for_driver(db, int(instance.driver_id))
        if resolved is not None:
            vid = int(resolved)
    if vid is None:
        return None
    row = db.query(Vehicle).filter(Vehicle.id == vid).first()
    if row is None:
        return None
    return {
        "id": int(row.id),
        "name": str(row.name or f"Vehicle #{row.id}"),
        "plate": getattr(row, "plate", None),
    }


def _tour_instance_public_booking_dict(db: Session, instance: TourInstance) -> dict:
    """Safe subset for anonymous booking UIs."""
    capacity = compute_capacity_from_db(db, instance.id)
    booked = _confirmed_booked_people(db, instance.id)
    available = max(0, int(capacity) - int(booked))
    if _instance_status_lower(instance) == "cancelled":
        available = 0
    raw_date = instance.date
    date_str = raw_date.isoformat() if hasattr(raw_date, "isoformat") else str(raw_date)
    primary_vehicle = _primary_vehicle_dict_for_instance(db, instance)
    drv = getattr(instance, "driver", None)
    driver_name = getattr(drv, "name", None) if drv is not None else getattr(instance, "driver_name", None)
    vehicle_plate = primary_vehicle.get("plate") if isinstance(primary_vehicle, dict) else None
    vehicle_name = primary_vehicle.get("name") if isinstance(primary_vehicle, dict) else getattr(instance, "vehicle_name", None)
    return {
        "id": int(instance.id),
        "tour_id": int(instance.tour_id),
        "date": date_str,
        "available_seats": int(available),
        "driver_name": driver_name,
        "vehicle_name": vehicle_name,
        "vehicle_plate": vehicle_plate,
        "vehicle": primary_vehicle,
    }


@router.get("")
def list_instances(
    tour_id: int | None = None,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[TourInstanceResponse]:
    query = db.query(TourInstance)
    if tour_id is not None:
        query = query.filter(TourInstance.tour_id == tour_id)
    instances = query.order_by(TourInstance.date.asc(), TourInstance.id.asc()).all()
    return [_tour_instance_public_dict(db, instance) for instance in instances]


@router.post("")
def create_instance(
    payload: TourInstanceCreateRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    tour = db.query(Tour).filter(Tour.id == payload.tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    same_day = (
        db.query(TourInstance)
        .filter(TourInstance.tour_id == payload.tour_id, TourInstance.date == payload.date)
        .all()
    )
    if any(_instance_occupies_calendar_slot(ti) for ti in same_day):
        raise HTTPException(
            status_code=409,
            detail="Esiste già un turno per questo tour in questa data",
        )

    instance = TourInstance(
        tour_id=payload.tour_id,
        date=payload.date,
        status=payload.status,
        vehicles=0,
        capacity=0,
        vehicle_ids=[],
    )
    db.add(instance)
    db.flush()

    if payload.vehicles is not None:
        _replace_instance_vehicles(db, instance, payload.vehicles)
    if payload.driver_ids is not None:
        _apply_driver_ids_to_instance(db, instance, payload.driver_ids)

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


@router.get(
    "/{instance_id}/detail",
    response_model=TourInstanceResponse,
)
def get_instance_admin_detail(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    """Full instance payload for admin dashboards (replaces legacy authenticated GET /{id})."""
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")
    tour = db.query(Tour).filter(Tour.id == instance.tour_id).first()
    out = _tour_instance_public_dict(db, instance)
    out["tour_title"] = tour.title if tour else None
    return out


@router.get("/public/catalog", response_model=list[TourInstanceCatalogItem])
def list_public_instance_catalog(db: Session = Depends(get_db)) -> list[TourInstanceCatalogItem]:
    """
    Public: upcoming bookable tour instances (active tour, not cancelled/completed, seats > 0).
    Used by the tourist client on port 5173.
    """
    today = Date.today()
    rows = (
        db.query(TourInstance, Tour)
        .join(Tour, Tour.id == TourInstance.tour_id)
        .filter(Tour.active.is_(True), TourInstance.date >= today)
        .order_by(TourInstance.date.asc(), TourInstance.id.asc())
        .all()
    )
    out: list[TourInstanceCatalogItem] = []
    for inst, tour in rows:
        if _instance_blocks_new_bookings(inst):
            continue
        d = _tour_instance_public_booking_dict(db, inst)
        av = int(d.get("available_seats") or 0)
        if av <= 0:
            continue
        bp = float(tour.price or 0.0)
        unit = round(bp * 1.25, 2)
        out.append(
            TourInstanceCatalogItem(
                id=int(inst.id),
                tour_id=int(tour.id),
                tour_title=str(tour.title or ""),
                city=getattr(tour, "city", None),
                date=str(d["date"]),
                available_seats=av,
                base_price=bp,
                checkout_unit_eur=unit,
            )
        )
    return out


@router.get(
    "/{instance_id}",
    response_model=TourInstancePublicBookingResponse,
)
def get_instance(instance_id: int, db: Session = Depends(get_db)) -> TourInstancePublicBookingResponse:
    """Public: minimal fields for booking flow (no auth)."""
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")
    return TourInstancePublicBookingResponse(**_tour_instance_public_booking_dict(db, instance))


@router.patch("/{instance_id}")
def update_instance(
    instance_id: int,
    payload: TourInstanceUpdateRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")

    if payload.tour_id is not None:
        tour = db.query(Tour).filter(Tour.id == payload.tour_id).first()
        if tour is None:
            raise HTTPException(status_code=404, detail="Tour not found")
        instance.tour_id = payload.tour_id
    if payload.date is not None:
        instance.date = payload.date
    if payload.status is not None:
        instance.status = payload.status

    dups = (
        db.query(TourInstance)
        .filter(
            TourInstance.tour_id == instance.tour_id,
            TourInstance.date == instance.date,
            TourInstance.id != instance.id,
        )
        .all()
    )
    if any(_instance_occupies_calendar_slot(ti) for ti in dups):
        raise HTTPException(
            status_code=409,
            detail="Esiste già un turno per questo tour in questa data",
        )

    try:
        if payload.vehicles is not None:
            _replace_instance_vehicles(db, instance, payload.vehicles)
            new_cap = compute_capacity_from_db(db, instance.id)
            booked = _confirmed_booked_people(db, instance.id)
            if new_cap < booked:
                raise HTTPException(
                    status_code=400,
                    detail="Capacità inferiore alle prenotazioni confermate",
                )
        if payload.driver_ids is not None:
            _apply_driver_ids_to_instance(db, instance, payload.driver_ids)

        instance.capacity = compute_capacity_from_db(db, instance.id)
        db.add(instance)
        db.commit()
    except HTTPException:
        db.rollback()
        raise

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


@router.delete("/{instance_id}")
def delete_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    """
    Remove a tour instance and dependent rows in a single DB transaction (commit once).

    Order: quotes → service_logs → payments → (clear bnb_commission_transfers.booking_id) →
    bookings → driver_schedules → instance vehicles → trips (tour_instance_id) → instance.
    """
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turno non trovato")

    try:
        booking_ids = [
            int(row[0])
            for row in db.query(Booking.id).filter(Booking.tour_instance_id == instance_id).all()
        ]

        if booking_ids:
            # 1) Quotes linked to these bookings (FK to bookings, usually no ON DELETE CASCADE)
            db.query(Quote).filter(Quote.booking_id.in_(booking_ids)).delete(synchronize_session=False)
            # 2) Service logs (FK to bookings)
            db.query(ServiceLog).filter(ServiceLog.booking_id.in_(booking_ids)).delete(
                synchronize_session=False
            )
            # 3) Payments (explicit delete; many DBs use ON DELETE CASCADE, SQLite may vary)
            db.query(Payment).filter(Payment.booking_id.in_(booking_ids)).delete(
                synchronize_session=False
            )
            # 4) Orphan commission transfer pointers (no FK, keep row history)
            db.query(BnbCommissionTransfer).filter(BnbCommissionTransfer.booking_id.in_(booking_ids)).update(
                {BnbCommissionTransfer.booking_id: None},
                synchronize_session=False,
            )
            # 5) Bookings
            db.query(Booking).filter(Booking.id.in_(booking_ids)).delete(synchronize_session=False)

        # 6) Driver schedules for this instance (explicit; DB may also SET NULL on instance delete)
        db.query(DriverSchedule).filter(DriverSchedule.tour_instance_id == instance_id).delete(
            synchronize_session=False
        )

        # 7) Fleet rows for this instance
        db.query(TourInstanceVehicle).filter(TourInstanceVehicle.tour_instance_id == instance_id).delete(
            synchronize_session=False
        )

        # 8) Trips bound to this instance (bookings already removed)
        db.query(Trip).filter(Trip.tour_instance_id == instance_id).delete(synchronize_session=False)

        # 9) Instance
        db.delete(instance)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        print(error)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Impossibile eliminare il turno: alcuni record collegati non sono stati rimossi "
                "(vincolo sul database). Verifica log o contatta il supporto."
            ),
        ) from error
    except Exception as error:
        db.rollback()
        print(error)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Eliminazione del turno non completata. Riprova tra poco o verifica i log del server.",
        ) from error

    return {"success": True, "id": instance_id}


@router.post("/{instance_id}/cancel")
def cancel_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    """
    Soft-cancel: keep the tour instance row and linked bookings (for admin / refunds).
    New bookings and Stripe checkout are blocked while status is cancelled.
    """
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")
    st = _instance_status_lower(instance)
    if st == "cancelled":
        return {"success": True, "id": instance_id, "status": "cancelled", "note": "already_cancelled"}
    if st == "completed":
        raise HTTPException(status_code=400, detail="Turno già completato, non annullabile")

    instance.status = "cancelled"
    db.add(instance)
    db.commit()
    db.refresh(instance)

    capacity = compute_capacity_from_db(db, instance.id)
    occupied = (
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(Booking.tour_instance_id == instance.id, Booking.checked_in.is_(True))
        .scalar()
        or 0
    )
    manager.broadcast_tour_instance_sync(
        instance.id,
        {
            "type": "status_changed",
            "status": instance.status,
            "capacity": int(capacity),
            "occupied": int(occupied),
        },
    )
    return {"success": True, "id": instance_id, "status": instance.status}


@router.get("/{instance_id}/bookings")
def get_instance_bookings(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[dict]:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")

    bookings = (
        db.query(Booking)
        .filter(Booking.tour_instance_id == instance_id)
        .order_by(Booking.id.desc())
        .all()
    )
    return [
        {
            "id": b.id,
            "name": b.customer_name,
            "passengers": int(b.people),
            "status": str(getattr(b, "status", "") or "pending"),
            "checked_in": bool(getattr(b, "checked_in", False)),
            "payment_intent_id": getattr(b, "payment_intent_id", None),
        }
        for b in bookings
    ]


@router.put("/{instance_id}/assign")
def assign_driver(
    instance_id: int,
    payload: AssignRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")
    if _instance_status_lower(instance) == "cancelled":
        raise HTTPException(status_code=400, detail="Turno annullato")

    driver = db.query(Driver).filter(Driver.id == payload.driver_id, Driver.is_active.is_(True)).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    instance.driver_id = driver.id
    instance.driver_name = driver.name
    instance.assigned_driver_ids = [int(driver.id)]
    if payload.vehicle_ids:
        rows = (
            db.query(TourInstanceVehicle, Vehicle)
            .join(Vehicle, Vehicle.id == TourInstanceVehicle.vehicle_id)
            .filter(
                TourInstanceVehicle.tour_instance_id == instance.id,
                TourInstanceVehicle.vehicle_id.in_(payload.vehicle_ids),
            )
            .all()
        )
        if not rows:
            raise HTTPException(status_code=400, detail="No assigned vehicles found for this instance")
        instance.vehicle_ids = [r[0].vehicle_id for r in rows]
        instance.vehicle_name = ", ".join(v.name for _, v in rows)
    else:
        dv = TripService.resolve_vehicle_id_for_driver(db, driver.id)
        if dv is not None:
            _sync_driver_vehicle_into_instance(db, instance, int(dv))
        else:
            rows = load_instance_vehicle_rows(db, instance.id)
            if rows:
                instance.vehicle_ids = [int(r["vehicle_id"]) for r in rows]
                instance.vehicle_name = ", ".join(r["vehicle_name"] for r in rows)
            else:
                instance.vehicle_ids = []
                instance.vehicle_name = None
    instance.capacity = compute_capacity_from_db(db, instance.id)
    db.add(instance)
    for t in (
        db.query(Trip)
        .filter(Trip.tour_instance_id == instance.id, Trip.driver_id == driver.id)
        .all()
    ):
        TripService.ensure_trip_vehicle_matches_driver(db, t)
    db.commit()

    return {
        "success": True,
        "id": instance.id,
        "driver_id": instance.driver_id,
        "driver_name": instance.driver_name,
        "vehicle_ids": instance.vehicle_ids or [],
        "vehicle_name": instance.vehicle_name,
        "capacity": instance.capacity,
        "vehicle": _primary_vehicle_dict_for_instance(db, instance),
    }


@router.post("/{instance_id}/vehicles")
def assign_instance_vehicles(
    instance_id: int,
    payload: AssignVehiclesRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")
    if _instance_status_lower(instance) == "cancelled":
        raise HTTPException(status_code=400, detail="Turno annullato")

    db.query(TourInstanceVehicle).filter(TourInstanceVehicle.tour_instance_id == instance_id).delete()

    assigned_ids: list[int] = []
    names: list[str] = []
    for item in payload.vehicles:
        if item.quantity < 1:
            raise HTTPException(status_code=400, detail="quantity must be >= 1")
        vehicle = db.query(Vehicle).filter(Vehicle.id == item.vehicle_id, Vehicle.active.is_(True)).first()
        if vehicle is None:
            raise HTTPException(status_code=404, detail=f"Vehicle {item.vehicle_id} not found")
        db.add(
            TourInstanceVehicle(
                tour_instance_id=instance_id,
                vehicle_id=vehicle.id,
                quantity=item.quantity,
            )
        )
        assigned_ids.append(vehicle.id)
        names.append(vehicle.name)

    db.flush()
    instance.vehicle_ids = assigned_ids
    instance.vehicle_name = ", ".join(names) if names else None
    instance.capacity = compute_capacity_from_db(db, instance_id)
    db.add(instance)
    db.commit()

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

    return {
        "success": True,
        "id": instance.id,
        "vehicle_ids": instance.vehicle_ids or [],
        "capacity": int(instance.capacity or 0),
    }


@router.post("/{instance_id}/start")
def start_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")
    st = _instance_status_lower(instance)
    if st == "cancelled":
        raise HTTPException(status_code=400, detail="Turno annullato")
    if st == "completed":
        raise HTTPException(status_code=400, detail="Turno già completato")
    if not instance.driver_id:
        raise HTTPException(status_code=400, detail="Cannot start trip without driver")

    instance.status = "in_progress"
    instance.capacity = compute_capacity_from_db(db, instance.id)
    db.add(instance)
    db.commit()
    manager.broadcast_tour_instance_sync(
        instance.id,
        {
            "type": "status_changed",
            "status": instance.status,
            "capacity": int(instance.capacity or 0),
        },
    )
    return {"success": True, "id": instance.id, "status": instance.status}


@router.post("/{instance_id}/complete")
def complete_instance(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")
    st = _instance_status_lower(instance)
    if st == "cancelled":
        raise HTTPException(status_code=400, detail="Turno annullato")
    if st == "completed":
        raise HTTPException(status_code=400, detail="Turno già completato")

    checked_in_count = (
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(Booking.tour_instance_id == instance.id, Booking.checked_in.is_(True))
        .scalar()
        or 0
    )
    if int(checked_in_count) <= 0:
        raise HTTPException(status_code=400, detail="Cannot complete trip without check-ins")

    instance.status = "completed"
    db.add(instance)
    db.commit()
    capacity = compute_capacity_from_db(db, instance.id)
    manager.broadcast_tour_instance_sync(
        instance.id,
        {
            "type": "status_changed",
            "status": instance.status,
            "capacity": int(capacity),
            "occupied": int(checked_in_count),
        },
    )
    return {"success": True, "id": instance.id, "status": instance.status}


@router.get("/{instance_id}/status")
def instance_status(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")

    capacity = compute_capacity_from_db(db, instance.id)
    occupied = (
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(Booking.tour_instance_id == instance.id, Booking.checked_in.is_(True))
        .scalar()
        or 0
    )
    return {
        "status": instance.status,
        "capacity": int(capacity),
        "occupied": int(occupied),
    }


@router.get("/{instance_id}/service-sheet")
def service_sheet(
    instance_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> Response:
    instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
    if instance is None:
        raise HTTPException(status_code=404, detail="Tour instance not found")

    tour = db.query(Tour).filter(Tour.id == instance.tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    bookings = (
        db.query(Booking)
        .filter(Booking.tour_instance_id == instance.id)
        .order_by(Booking.id.asc())
        .all()
    )

    total_passengers = (
        db.query(func.coalesce(func.sum(Booking.people), 0))
        .filter(Booking.tour_instance_id == instance.id)
        .scalar()
        or 0
    )
    capacity = compute_capacity_from_db(db, instance.id)

    if not PDF_ENABLED:
        raise HTTPException(status_code=500, detail="PDF generation is not available (WeasyPrint missing)")

    company_name = os.getenv("COMPANY_NAME", "NCC Demo")

    def esc(s: str) -> str:
        return (
            str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    rows_html = ""
    for b in bookings:
        rows_html += f"""
          <tr>
            <td>{esc(b.customer_name)}</td>
            <td style="text-align:center;">{int(b.people)}</td>
            <td style="text-align:center;">{"YES" if getattr(b, "checked_in", False) else "NO"}</td>
          </tr>
        """

    base_dir = Path(__file__).resolve().parents[2]  # backend/
    logo_path = base_dir / "static" / "logo.png"
    logo_html = ""
    if logo_path.exists():
        logo_html = f'<img src="file://{logo_path}" class="logo" alt="Logo" />'

    html = f"""
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {{
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 28px;
            font-size: 12px;
          }}
          .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }}
          .logo {{ height: 44px; }}
          .title {{
            font-size: 18px;
            font-weight: 700;
            margin: 0;
          }}
          .subtitle {{
            margin: 4px 0 0 0;
            color: #4b5563;
          }}
          .meta {{
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
          }}
          .grid {{
            width: 100%;
            border-collapse: collapse;
          }}
          .grid th {{
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #6b7280;
            border-bottom: 1px solid #e5e7eb;
            padding: 8px 6px;
          }}
          .grid td {{
            border-bottom: 1px solid #f3f4f6;
            padding: 10px 6px;
          }}
          .footer {{
            margin-top: 18px;
            color: #6b7280;
            font-size: 10px;
            border-top: 1px solid #e5e7eb;
            padding-top: 10px;
            text-align: center;
          }}
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">{esc(company_name)} — Service Sheet</div>
            <div class="subtitle">{esc(tour.title)} — {instance.date.isoformat()}</div>
          </div>
          <div>{logo_html}</div>
        </div>

        <div class="meta">
          <div><strong>Tour:</strong> {esc(tour.title)}</div>
          <div><strong>Date:</strong> {instance.date.isoformat()}</div>
          <div><strong>Driver:</strong> {esc(instance.driver_name or "—")}</div>
          <div><strong>Vehicle:</strong> {esc(instance.vehicle_name or "—")}</div>
          <div><strong>Status:</strong> {esc(instance.status)}</div>
          <div><strong>Capacity:</strong> {capacity}</div>
          <div><strong>Total passengers:</strong> {int(total_passengers)}</div>
        </div>

        <table class="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th style="text-align:center;">Passengers</th>
              <th style="text-align:center;">Checked-in</th>
            </tr>
          </thead>
          <tbody>
            {rows_html or '<tr><td colspan="3">No bookings</td></tr>'}
          </tbody>
        </table>

        <div class="footer">Generated by NCC Demo</div>
      </body>
    </html>
    """

    pdf_bytes = HTML(string=html, base_url=str(base_dir)).write_pdf()  # type: ignore[misc]
    return Response(content=pdf_bytes, media_type="application/pdf")

