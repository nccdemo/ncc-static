from pydantic import BaseModel, ConfigDict, Field, field_validator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette import status

from app.crud.driver import get_driver_by_email
from app.crud.user import get_user_by_email
from app.database import get_db
from app.deps.auth import get_current_active_user, get_current_role
from app.models.driver import Driver
from app.models.provider import Provider
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.driver_auth import create_driver_access_token, verify_password
from app.services.driver_registration import register_public_driver
from app.services.jwt_auth import create_access_token
from app.services.referral_booking import allocate_unique_bnb_referral_code, normalize_referral_code
from app.services.user_passwords import hash_user_password, verify_user_password

router = APIRouter(prefix="/auth", tags=["auth"])


class AdminLoginRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class DriverLoginRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class DriverRegisterPayload(BaseModel):
    """Self-service driver signup (row in ``drivers`` with ``password_hash``; driver JWT auth uses drivers, not ``users``)."""

    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=200)
    name: str = Field(..., min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=40)

    class VehicleIn(BaseModel):
        """Optional vehicle payload (preferred by newer clients)."""

        name: str | None = Field(default=None, max_length=200)
        plate: str | None = Field(default=None, max_length=40)
        vehicle_type: str | None = Field(default=None, max_length=80)
        seats: int | None = Field(default=None, ge=1, le=60)

    vehicle: VehicleIn | None = None

    # Backward-compatible fields for older clients.
    plate_number: str | None = Field(default=None, max_length=40)
    vehicle_type: str | None = Field(default=None, max_length=80)
    seats: int | None = Field(default=None, ge=1, le=60)
    driver_license_number: str | None = Field(default=None, max_length=80)
    ncc_license_number: str | None = Field(default=None, max_length=80)
    insurance_number: str | None = Field(default=None, max_length=80)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        s = (v or "").strip().lower()
        if "@" not in s or not s.split("@")[-1].strip():
            raise ValueError("Invalid email address")
        return s


class BnbRegisterAuthPayload(BaseModel):
    # Optional: some UIs capture a display name for the structure; the backend currently
    # stores B&B identity on `providers` and links to `users`.
    name: str | None = Field(default=None, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    # Backward-compatible: older clients may send phone; new API only requires email/password/name.
    phone: str | None = Field(default=None, max_length=40)
    password: str = Field(..., min_length=8, max_length=200)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        s = (v or "").strip().lower()
        if "@" not in s or not s.split("@")[-1].strip():
            raise ValueError("Invalid email address")
        return s


class DriverRegisterResponse(BaseModel):
    id: int
    signup_status: str
    message: str
    can_login_now: bool = False
    access_token: str | None = None
    token_type: str | None = None


class AuthLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    referral_code: str | None = None


class TokenRoleResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    is_active: bool


def _jwt_extra_for_user(user: User) -> dict:
    uid = int(user.id)
    return {"user_id": uid}


def _referral_code_for_bnb_user(db: Session, user_id: int) -> str | None:
    prov = (
        db.query(Provider)
        .filter(Provider.user_id == int(user_id), func.lower(Provider.type) == "bnb")
        .first()
    )
    if prov is None:
        return None
    return normalize_referral_code(getattr(prov, "referral_code", None))


def auth_login_response_for_user(db: Session, user: User) -> AuthLoginResponse:
    role = (getattr(user, "role", None) or "user").strip().lower()
    uid = int(user.id)
    token = create_access_token(
        subject=str(uid),
        role=role,
        extra_claims=_jwt_extra_for_user(user),
    )
    ref: str | None = None
    if role == "bnb":
        ref = _referral_code_for_bnb_user(db, uid)
    return AuthLoginResponse(access_token=token, role=role, referral_code=ref)


def require_users_table_user(db: Session, email: str, password: str) -> User:
    """Validate ``users`` row by email/password; raise 401 if missing or wrong password."""
    user = get_user_by_email(db, email)
    if user is None or not verify_user_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return user


def issue_users_table_access_token(db: Session, email: str, password: str) -> AuthLoginResponse:
    """JWT for a ``users`` row after email/password check (``POST /api/auth/login``)."""
    user = require_users_table_user(db, email, password)
    return auth_login_response_for_user(db, user)


@router.post("/login", response_model=AuthLoginResponse)
def login(
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
) -> AuthLoginResponse:
    """
    Authenticate against the ``users`` table; return JWT (7d) with ``user_id`` and ``role``.
    For B&B accounts, includes ``referral_code``.
    """
    return issue_users_table_access_token(db, payload.email, payload.password)


@router.post("/register-driver", response_model=AuthLoginResponse, status_code=status.HTTP_201_CREATED)
def register_driver_with_user(
    payload: DriverRegisterPayload,
    db: Session = Depends(get_db),
) -> AuthLoginResponse:
    """
    Create ``users`` (role ``driver``) + ``drivers`` profile linked via ``user_id``.
    Password is bcrypt-hashed on the user; returns JWT like ``/auth/login``.
    """
    email = payload.email
    if get_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    if get_driver_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=email,
        password_hash=hash_user_password(payload.password),
        role="driver",
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None

    driver = Driver(
        user_id=int(user.id),
        name=payload.name.strip(),
        phone=(payload.phone or "").strip(),
        email=email,
        signup_status="active",
        is_active=True,
        vehicle_plate_number=(payload.plate_number or "").strip() or None,
        vehicle_type=(payload.vehicle_type or "").strip() or None,
        vehicle_seats=payload.seats,
        driver_license_number=(payload.driver_license_number or "").strip() or None,
        ncc_license_number=(payload.ncc_license_number or "").strip() or None,
        insurance_number=(payload.insurance_number or "").strip() or None,
    )
    db.add(driver)
    db.flush()

    vehicle_obj = payload.vehicle
    plate = (getattr(vehicle_obj, "plate", None) or payload.plate_number or "").strip() or None
    vtype = (getattr(vehicle_obj, "vehicle_type", None) or payload.vehicle_type or "").strip() or None
    seats_raw = getattr(vehicle_obj, "seats", None)
    if seats_raw is None:
        seats_raw = payload.seats
    seats = int(seats_raw) if seats_raw is not None else 7
    vname_override = (getattr(vehicle_obj, "name", None) or "").strip() if vehicle_obj is not None else ""

    if plate or vtype or seats_raw is not None or vname_override:
        if vname_override:
            vname = vname_override
        else:
            name_parts = [p for p in [vtype, plate] if p]
            vname = " - ".join(name_parts) if name_parts else f"Vehicle for driver #{int(driver.id)}"
        vehicle = Vehicle(
            driver_id=int(driver.id),
            name=vname,
            plate=plate,
            seats=seats,
            vehicle_type=vtype,
            type=vtype,
            active=True,
            company_id=getattr(driver, "company_id", None),
        )
        db.add(vehicle)
        db.flush()
        driver.vehicle_id = int(vehicle.id)
        db.add(driver)
    db.commit()
    db.refresh(user)

    return auth_login_response_for_user(db, user)


@router.post("/register-bnb", response_model=AuthLoginResponse, status_code=status.HTTP_201_CREATED)
def register_bnb_with_user(
    payload: BnbRegisterAuthPayload,
    db: Session = Depends(get_db),
) -> AuthLoginResponse:
    """Create ``users`` (role ``bnb``) + ``providers`` (type ``bnb``) with a unique referral code."""
    email = payload.email
    if get_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=email,
        password_hash=hash_user_password(payload.password),
        role="bnb",
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None

    uid = int(user.id)
    if uid < 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed: user id not assigned",
        )

    code = allocate_unique_bnb_referral_code(db)
    # ``Provider.user_id`` must always link to ``users.id`` for B&B profile/upload endpoints.
    db.add(
        Provider(
            user_id=uid,
            type="bnb",
            referral_code=code,
            total_earnings=0.0,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None
    db.refresh(user)
    return auth_login_response_for_user(db, user)


@router.get("/me", response_model=CurrentUserOut)
def auth_me(current: User = Depends(get_current_active_user)) -> User:
    return current


@router.get("/admin/ping")
def auth_admin_ping(_user: User = Depends(get_current_role(["admin"]))) -> dict:
    """Example route protected with ``get_current_role([\"admin\"])``."""
    return {"ok": True}


@router.get("/driver-or-bnb/ping")
def auth_driver_or_bnb_ping(_user: User = Depends(get_current_role(["driver", "bnb"]))) -> dict:
    """Example route allowed for drivers or B&B partners."""
    return {"ok": True}


@router.post("/bnb/login", response_model=TokenRoleResponse)
def bnb_login(
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
) -> TokenRoleResponse:
    """B&B partner login (``users`` row with ``role`` = ``bnb``)."""
    user = get_user_by_email(db, payload.email)
    if user is None or not verify_user_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    role = (getattr(user, "role", None) or "").strip().lower()
    if role != "bnb":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a B&B account",
        )
    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    token = create_access_token(
        subject=str(int(user.id)),
        role="bnb",
        extra_claims=_jwt_extra_for_user(user),
    )
    return TokenRoleResponse(access_token=token, role="bnb")


@router.post("/admin/login", response_model=TokenRoleResponse)
def admin_login(
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
) -> TokenRoleResponse:
    user = get_user_by_email(db, payload.email)
    if user is None or not verify_user_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    role = (getattr(user, "role", None) or "").strip().lower()
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not an administrator",
        )
    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    token = create_access_token(
        subject=str(int(user.id)),
        role="admin",
        extra_claims=_jwt_extra_for_user(user),
    )
    return TokenRoleResponse(access_token=token, role="admin")


@router.post("/driver/register", response_model=DriverRegisterResponse, status_code=status.HTTP_201_CREATED)
def driver_register(
    payload: DriverRegisterPayload,
    db: Session = Depends(get_db),
) -> DriverRegisterResponse:
    """
    Public registration for the driver app.
    Password is hashed with bcrypt. New drivers are ``pending`` until an admin approves, unless
    ``DRIVER_REGISTER_AUTO_APPROVE=true`` (then active immediately and ``access_token`` is returned).
    """
    raw = register_public_driver(
        db,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        vehicle_plate_number=payload.plate_number,
        vehicle_type=payload.vehicle_type,
        vehicle_seats=payload.seats,
        driver_license_number=payload.driver_license_number,
        ncc_license_number=payload.ncc_license_number,
        insurance_number=payload.insurance_number,
    )
    return DriverRegisterResponse(
        id=int(raw["id"]),
        signup_status=str(raw["signup_status"]),
        message=str(raw["message"]),
        can_login_now=bool(raw.get("can_login_now")),
        access_token=raw.get("access_token"),
        token_type="bearer" if raw.get("access_token") else None,
    )


@router.post("/driver/login", response_model=TokenRoleResponse)
def driver_login(
    payload: DriverLoginRequest,
    db: Session = Depends(get_db),
) -> TokenRoleResponse:
    d = get_driver_by_email(db, payload.email)
    if d is None or not verify_password(payload.password, d.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not d.is_active:
        if d.signup_status == "pending":
            detail = "Your account is pending approval"
        elif d.signup_status == "rejected":
            detail = "Your registration was not approved"
        else:
            detail = "Account is disabled"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )
    if d.signup_status not in ("active", "legacy"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account cannot sign in",
        )
    token = create_driver_access_token(int(d.id), (d.email or "").strip())
    return TokenRoleResponse(access_token=token, role="driver")
