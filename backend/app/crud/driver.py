from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.driver import Driver
from app.models.driver_payout import DriverInvoice, DriverPayout
from app.models.driver_schedule import DriverSchedule
from app.models.driver_wallet import DriverWallet, DriverWalletTransaction
from app.models.driver_work_log import DriverWorkLog
from app.models.tour_instance import TourInstance
from app.models.trip import Trip
from app.schemas.driver import DriverCreate


def get_drivers(db: Session) -> list[Driver]:
    return db.query(Driver).all()


def get_driver_by_email(db: Session, email: str) -> Driver | None:
    em = email.strip().lower()
    if not em:
        return None
    return db.query(Driver).filter(func.lower(Driver.email) == em).first()


def register_external_driver(
    db: Session,
    *,
    name: str,
    email: str,
    phone: str,
    password_hash: str,
    vehicle_plate_number: str | None = None,
    vehicle_type: str | None = None,
    vehicle_seats: int | None = None,
    driver_license_number: str | None = None,
    ncc_license_number: str | None = None,
    insurance_number: str | None = None,
) -> Driver:
    def _s(v: str | None) -> str | None:
        if v is None:
            return None
        t = str(v).strip()
        return t or None

    driver = Driver(
        name=name.strip(),
        email=email.strip().lower(),
        phone=phone.strip(),
        password_hash=password_hash,
        is_active=False,
        signup_status="pending",
        status="available",
        vehicle_plate_number=_s(vehicle_plate_number),
        vehicle_type=_s(vehicle_type),
        vehicle_seats=int(vehicle_seats) if vehicle_seats is not None else None,
        driver_license_number=_s(driver_license_number),
        ncc_license_number=_s(ncc_license_number),
        insurance_number=_s(insurance_number),
    )
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


def activate_driver(db: Session, driver_id: int) -> Driver | None:
    """Set driver approved for login and dispatch; ensures wallet row exists."""
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if driver is None:
        return None
    driver.is_active = True
    if driver.signup_status in ("pending", "rejected"):
        driver.signup_status = "active"
    db.add(driver)
    db.commit()
    db.refresh(driver)
    try:
        existing = (
            db.query(DriverWallet).filter(DriverWallet.driver_id == int(driver.id)).first()
        )
        if existing is None:
            db.add(DriverWallet(driver_id=int(driver.id), balance=0.0))
            db.commit()
    except Exception:
        db.rollback()
    return driver


def approve_driver_signup(db: Session, driver_id: int) -> Driver | None:
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if driver is None or driver.signup_status != "pending":
        return None
    return activate_driver(db, driver_id)


def reject_driver_signup(db: Session, driver_id: int) -> Driver | None:
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if driver is None or driver.signup_status != "pending":
        return None
    driver.signup_status = "rejected"
    driver.is_active = False
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


def create_driver(db: Session, payload: DriverCreate) -> Driver:
    data = payload.model_dump()
    data.setdefault("signup_status", "legacy")
    driver = Driver(**data)
    db.add(driver)
    db.commit()
    db.refresh(driver)
    # Auto-create wallet for cash tracking
    try:
        db.add(DriverWallet(driver_id=int(driver.id), balance=0.0))
        db.commit()
    except Exception:
        db.rollback()
    return driver


def delete_driver(db: Session, driver_id: int) -> bool:
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if driver is None:
        return False

    db.query(Trip).filter(Trip.driver_id == driver_id).update(
        {Trip.driver_id: None}, synchronize_session=False
    )
    db.query(Booking).filter(Booking.driver_id == driver_id).update(
        {Booking.driver_id: None}, synchronize_session=False
    )
    db.query(TourInstance).filter(TourInstance.driver_id == driver_id).update(
        {TourInstance.driver_id: None}, synchronize_session=False
    )

    db.query(DriverSchedule).filter(DriverSchedule.driver_id == driver_id).delete(
        synchronize_session=False
    )
    db.query(DriverWorkLog).filter(DriverWorkLog.driver_id == driver_id).delete(
        synchronize_session=False
    )
    db.query(DriverWalletTransaction).filter(
        DriverWalletTransaction.driver_id == driver_id
    ).delete(synchronize_session=False)
    db.query(DriverWallet).filter(DriverWallet.driver_id == driver_id).delete(
        synchronize_session=False
    )

    db.query(DriverInvoice).filter(DriverInvoice.driver_id == driver_id).delete(
        synchronize_session=False
    )
    db.query(DriverPayout).filter(DriverPayout.driver_id == driver_id).delete(
        synchronize_session=False
    )

    db.delete(driver)
    db.commit()
    return True
