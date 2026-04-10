"""Unified portal login (B&B ``users`` or ``drivers``)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette import status

from app.crud.driver import get_driver_by_email
from app.crud.user import get_user_by_email
from app.database import get_db
from app.models.driver import Driver
from app.routers.auth import AdminLoginRequest, TokenRoleResponse
from app.services.driver_auth import create_driver_access_token, verify_password
from app.services.jwt_auth import create_access_token
from app.services.user_passwords import verify_user_password

router = APIRouter(tags=["auth"])


def _jwt_extra_for_user_id(user_id: int) -> dict:
    return {"user_id": int(user_id)}


@router.post("/login", response_model=TokenRoleResponse)
def portal_login(
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
) -> TokenRoleResponse:
    """
    Single sign-in for the NCC portal: B&B accounts (``users.role`` = ``bnb``) or drivers.

    Admin-only ``users`` rows are rejected so they keep using ``/api/auth/admin/login``.
    """
    email = (payload.email or "").strip()
    password = payload.password

    user = get_user_by_email(db, email)
    if user is not None:
        if not verify_user_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        if not bool(getattr(user, "is_active", True)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user",
            )
        role = (getattr(user, "role", None) or "").strip().lower()
        uid = int(user.id)
        if role == "bnb":
            token = create_access_token(
                subject=str(uid),
                role="bnb",
                extra_claims=_jwt_extra_for_user_id(uid),
            )
            return TokenRoleResponse(access_token=token, role="bnb")
        if role == "driver":
            linked = db.query(Driver).filter(Driver.user_id == uid).first()
            if linked is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Driver profile is not linked to this account; use driver app login if applicable.",
                )
            token = create_access_token(
                subject=str(uid),
                role="driver",
                extra_claims=_jwt_extra_for_user_id(uid),
            )
            return TokenRoleResponse(access_token=token, role="driver")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This sign-in is only for B&B and driver accounts.",
        )

    d = get_driver_by_email(db, email)
    if d is None or not verify_password(password, d.password_hash):
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
