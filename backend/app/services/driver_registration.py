"""Public self-registration for drivers (landing → ``drivers`` table, pending or env auto-approve)."""

import os
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session
from starlette import status

from app.crud.driver import approve_driver_signup, get_driver_by_email, register_external_driver
from app.models.driver import Driver
from app.models.vehicle import Vehicle
from app.services.driver_auth import create_driver_access_token, hash_password

_DRIVER_REGISTER_AUTO_APPROVE = os.getenv("DRIVER_REGISTER_AUTO_APPROVE", "").strip().lower() in (
    "1",
    "true",
    "yes",
)


def register_public_driver(
    db: Session,
    *,
    name: str,
    email: str,
    phone: str,
    password: str,
    min_password_length: int = 8,
    vehicle_plate_number: str | None = None,
    vehicle_type: str | None = None,
    vehicle_seats: int | None = None,
    driver_license_number: str | None = None,
    ncc_license_number: str | None = None,
    insurance_number: str | None = None,
) -> dict[str, Any]:
    """
    Create a driver with hashed password; default signup_status pending (inactive).
    If DRIVER_REGISTER_AUTO_APPROVE is set, approve immediately so they can log in.
    """
    pw = password or ""
    if len(pw) < min_password_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {min_password_length} characters",
        )
    em = (email or "").strip()
    if not em:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")
    if get_driver_by_email(db, em):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    ph = hash_password(pw)
    d: Driver = register_external_driver(
        db,
        name=name.strip(),
        email=em,
        phone=(phone or "").strip(),
        password_hash=ph,
        vehicle_plate_number=vehicle_plate_number,
        vehicle_type=vehicle_type,
        vehicle_seats=vehicle_seats,
        driver_license_number=driver_license_number,
        ncc_license_number=ncc_license_number,
        insurance_number=insurance_number,
    )

    # Create a fleet vehicle row for this driver (so dispatch / tour instances can link vehicles).
    # Vehicles table doesn't have driver_id; we link via drivers.vehicle_id.
    try:
        if getattr(d, "vehicle_id", None) is None:
            plate = (vehicle_plate_number or "").strip() or None
            vtype = (vehicle_type or "").strip() or None
            seats = int(vehicle_seats) if vehicle_seats is not None else 7

            # Only create if we have at least some vehicle info.
            if plate or vtype or vehicle_seats is not None:
                name_parts = [p for p in [vtype, plate] if p]
                vname = " - ".join(name_parts) if name_parts else f"Vehicle for driver #{int(d.id)}"
                vehicle = Vehicle(
                    driver_id=int(d.id),
                    name=vname,
                    plate=plate,
                    seats=seats,
                    vehicle_type=vtype,
                    type=vtype,
                    active=True,
                    company_id=getattr(d, "company_id", None),
                )
                db.add(vehicle)
                db.flush()
                d.vehicle_id = int(vehicle.id)
                db.add(d)
                db.commit()
                db.refresh(d)
                print("Vehicle created for driver:", int(d.id))
    except Exception:
        db.rollback()

    access_token: str | None = None
    if _DRIVER_REGISTER_AUTO_APPROVE:
        approved = approve_driver_signup(db, int(d.id))
        if approved is not None:
            d = approved
            access_token = create_driver_access_token(int(d.id), (d.email or "").strip())

    can_login = bool(access_token) or (
        str(d.signup_status or "") == "active" and bool(getattr(d, "is_active", False))
    )
    if can_login:
        msg = "Registration successful, you can now login"
    else:
        msg = (
            "Registration successful. Your account is pending administrator approval; "
            "you will be able to sign in once approved."
        )

    out: dict[str, Any] = {
        "id": d.id,
        "signup_status": d.signup_status,
        "message": msg,
        "can_login_now": can_login,
    }
    if access_token:
        out["access_token"] = access_token
        out["token_type"] = "bearer"
    return out
