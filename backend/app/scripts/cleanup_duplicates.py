from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy import func

from app.database import SessionLocal
from app.models.availability import Availability
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.driver_payout import DriverInvoice, DriverPayout
from app.models.driver_schedule import DriverSchedule
from app.models.driver_wallet import DriverWallet, DriverWalletTransaction
from app.models.payment import Payment
from app.models.provider import Provider
from app.models.tour_instance_vehicle import TourInstanceVehicle
from app.models.trip import Trip
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.referral_booking import allocate_unique_bnb_referral_code, normalize_referral_code

logger = logging.getLogger("cleanup_duplicates")


def _norm_email(v: str | None) -> str | None:
    if v is None:
        return None
    s = str(v).strip().lower()
    return s or None


def _norm_plate(v: str | None) -> str | None:
    if v is None:
        return None
    s = str(v).strip().upper()
    return s or None


def cleanup_users(db) -> None:
    logger.info("Users: normalizing emails and removing duplicates (keep latest).")

    users = db.query(User).order_by(User.id.asc()).all()
    changed = 0
    for u in users:
        email_old = getattr(u, "email", None)
        email_new = _norm_email(email_old)
        if email_new is not None and email_new != email_old:
            logger.info("Users: normalize email user_id=%s %r -> %r", u.id, email_old, email_new)
            u.email = email_new
            changed += 1
    if changed:
        db.flush()

    groups: dict[str, list[int]] = defaultdict(list)
    for u in db.query(User).filter(User.email.isnot(None)).all():
        groups[str(u.email)].append(int(u.id))

    removed = 0
    for email, ids in groups.items():
        if len(ids) <= 1:
            continue
        rows = (
            db.query(User)
            .filter(User.email == email)
            .order_by(User.created_at.desc().nullslast(), User.id.desc())
            .all()
        )
        keep = rows[0]
        for dupe in rows[1:]:
            logger.info(
                "Users: delete duplicate user id=%s (email=%r); keeping id=%s",
                dupe.id,
                email,
                keep.id,
            )
            db.delete(dupe)
            removed += 1

    logger.info("Users: normalized=%s, duplicates_deleted=%s", changed, removed)


def cleanup_bnb_referrals(db) -> None:
    logger.info("BNB: normalizing referral codes and regenerating duplicates.")

    rows = db.query(Provider).filter(func.lower(Provider.type) == "bnb").order_by(Provider.id.asc()).all()
    normalized = 0
    for p in rows:
        old = getattr(p, "referral_code", None)
        new = normalize_referral_code(old)
        if new != old:
            logger.info("BNB: normalize referral_code provider_id=%s %r -> %r", p.id, old, new)
            p.referral_code = new
            normalized += 1
    if normalized:
        db.flush()

    dup_codes = (
        db.query(Provider.referral_code)
        .filter(func.lower(Provider.type) == "bnb", Provider.referral_code.isnot(None))
        .group_by(Provider.referral_code)
        .having(func.count(Provider.id) > 1)
        .all()
    )
    dup_codes = [r[0] for r in dup_codes if r and r[0]]

    regenerated = 0
    for code in dup_codes:
        providers = (
            db.query(Provider)
            .filter(func.lower(Provider.type) == "bnb", Provider.referral_code == code)
            .order_by(Provider.id.desc())
            .all()
        )
        keep = providers[0]
        for p in providers[1:]:
            new_code = allocate_unique_bnb_referral_code(db)
            logger.info(
                "BNB: duplicate referral_code=%r provider_id=%s -> new_code=%r (keeping provider_id=%s)",
                code,
                p.id,
                new_code,
                keep.id,
            )
            p.referral_code = new_code
            regenerated += 1

    logger.info("BNB: normalized=%s, regenerated=%s", normalized, regenerated)


def cleanup_duplicate_drivers(db) -> None:
    logger.info("Drivers: removing duplicates by user_id (keep latest), re-linking references.")

    dup_user_ids = (
        db.query(Driver.user_id)
        .filter(Driver.user_id.isnot(None))
        .group_by(Driver.user_id)
        .having(func.count(Driver.id) > 1)
        .all()
    )
    dup_user_ids = [int(r[0]) for r in dup_user_ids if r and r[0] is not None]
    removed = 0

    for uid in dup_user_ids:
        drivers = db.query(Driver).filter(Driver.user_id == uid).order_by(Driver.id.desc()).all()
        keep = drivers[0]
        for d in drivers[1:]:
            old_id = int(d.id)
            new_id = int(keep.id)

            logger.info("Drivers: merge old_driver_id=%s into keep_driver_id=%s (user_id=%s)", old_id, new_id, uid)

            db.query(Trip).filter(Trip.driver_id == old_id).update({Trip.driver_id: new_id}, synchronize_session=False)
            db.query(Booking).filter(Booking.driver_id == old_id).update(
                {Booking.driver_id: new_id}, synchronize_session=False
            )
            db.query(Payment).filter(Payment.driver_id == old_id).update(
                {Payment.driver_id: new_id}, synchronize_session=False
            )
            db.query(DriverWallet).filter(DriverWallet.driver_id == old_id).update(
                {DriverWallet.driver_id: new_id}, synchronize_session=False
            )
            db.query(DriverWalletTransaction).filter(DriverWalletTransaction.driver_id == old_id).update(
                {DriverWalletTransaction.driver_id: new_id}, synchronize_session=False
            )
            db.query(DriverPayout).filter(DriverPayout.driver_id == old_id).update(
                {DriverPayout.driver_id: new_id}, synchronize_session=False
            )
            db.query(DriverInvoice).filter(DriverInvoice.driver_id == old_id).update(
                {DriverInvoice.driver_id: new_id}, synchronize_session=False
            )
            db.query(DriverSchedule).filter(DriverSchedule.driver_id == old_id).update(
                {DriverSchedule.driver_id: new_id}, synchronize_session=False
            )
            db.query(DriverWorkLog).filter(DriverWorkLog.driver_id == old_id).update(
                {DriverWorkLog.driver_id: new_id}, synchronize_session=False
            )
            db.query(Vehicle).filter(Vehicle.driver_id == old_id).update(
                {Vehicle.driver_id: new_id}, synchronize_session=False
            )

            # If the old driver was referenced as "default driver vehicle owner", keep it on the kept driver.
            if getattr(keep, "vehicle_id", None) is None and getattr(d, "vehicle_id", None) is not None:
                keep.vehicle_id = d.vehicle_id

            db.delete(d)
            removed += 1

    logger.info("Drivers: duplicates_deleted=%s", removed)


def cleanup_duplicate_vehicles(db) -> None:
    logger.info("Vehicles: normalizing plates and removing duplicates by plate (keep latest), re-linking references.")

    vehicles = db.query(Vehicle).filter(Vehicle.plate.isnot(None)).order_by(Vehicle.id.asc()).all()
    normalized = 0
    for v in vehicles:
        old = getattr(v, "plate", None)
        new = _norm_plate(old)
        if new != old:
            logger.info("Vehicles: normalize plate vehicle_id=%s %r -> %r", v.id, old, new)
            v.plate = new
            normalized += 1
    if normalized:
        db.flush()

    dup_plates = (
        db.query(Vehicle.plate)
        .filter(Vehicle.plate.isnot(None))
        .group_by(Vehicle.plate)
        .having(func.count(Vehicle.id) > 1)
        .all()
    )
    dup_plates = [r[0] for r in dup_plates if r and r[0]]

    removed = 0
    for plate in dup_plates:
        rows = db.query(Vehicle).filter(Vehicle.plate == plate).order_by(Vehicle.id.desc()).all()
        keep = rows[0]
        for dupe in rows[1:]:
            old_id = int(dupe.id)
            new_id = int(keep.id)

            logger.info("Vehicles: merge old_vehicle_id=%s into keep_vehicle_id=%s (plate=%r)", old_id, new_id, plate)

            db.query(Booking).filter(Booking.vehicle_id == old_id).update(
                {Booking.vehicle_id: new_id}, synchronize_session=False
            )
            db.query(Trip).filter(Trip.vehicle_id == old_id).update({Trip.vehicle_id: new_id}, synchronize_session=False)
            db.query(Availability).filter(Availability.vehicle_id == old_id).update(
                {Availability.vehicle_id: new_id}, synchronize_session=False
            )
            db.query(TourInstanceVehicle).filter(TourInstanceVehicle.vehicle_id == old_id).update(
                {TourInstanceVehicle.vehicle_id: new_id}, synchronize_session=False
            )
            db.query(Driver).filter(Driver.vehicle_id == old_id).update(
                {Driver.vehicle_id: new_id}, synchronize_session=False
            )

            db.delete(dupe)
            removed += 1

    logger.info("Vehicles: normalized=%s, duplicates_deleted=%s", normalized, removed)


def run() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    db = SessionLocal()
    try:
        with db.begin():
            cleanup_users(db)
            cleanup_bnb_referrals(db)
            cleanup_duplicate_drivers(db)
            cleanup_duplicate_vehicles(db)
        logger.info("Cleanup complete.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(run())

