import os
from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN

from app.database import get_db
from app.models.driver import Driver
from app.models.trip import Trip
from app.models.user import User
from app.services.jwt_auth import decode_access_token

security = HTTPBearer(auto_error=False)


def bnb_dashboard_dev_bypass_enabled() -> bool:
    """When true, B&B dashboard uses a fixed user id and does not validate JWT."""
    raw = (os.getenv("BNB_DASHBOARD_DEV_BYPASS") or "1").lower()
    return raw not in ("0", "false", "no")


def _current_bnb_user_from_bearer_token(
    creds: HTTPAuthorizationCredentials | None,
) -> dict:
    """Production: require Bearer JWT with role ``bnb``; return ``{\"id\": <users.id>}``."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None
    if payload.get("role") != "bnb":
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="B&B access required",
        )
    try:
        uid = int(str(payload.get("sub", "")))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    return {"id": uid}


def get_bnb_dashboard_identity(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict:
    """
    B&B dashboard identity.

    If a Bearer JWT is sent, it is always decoded (same user as ``/api/bnb/partner/*``).

    Dev bypass (``BNB_DASHBOARD_DEV_BYPASS``): only when **no** Bearer header — returns fixed
    ``{\"id\": 1}``. Without bypass, missing/invalid Bearer → 401.
    """
    if creds is not None and creds.scheme.lower() == "bearer":
        return _current_bnb_user_from_bearer_token(creds)
    if bnb_dashboard_dev_bypass_enabled():
        return {"id": 1}
    raise HTTPException(
        status_code=HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid Authorization header",
    )


def bearer_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> str:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    return creds.credentials


def auth_payload(token: Annotated[str, Depends(bearer_token)]) -> dict:
    try:
        return decode_access_token(token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None


def resolve_driver_id_from_auth_payload(db: Session, payload: dict) -> int | None:
    """
    Map JWT to ``drivers.id``.

    User-based tokens include ``user_id`` (``users.id``) and ``sub`` matching it; we resolve ``Driver.user_id``.
    Legacy driver tokens omit ``user_id`` and use ``drivers.id`` as ``sub``.
    """
    if (payload.get("role") or "").lower() != "driver":
        return None
    try:
        sub_i = int(str(payload.get("sub", "")))
    except (TypeError, ValueError):
        return None
    if "user_id" in payload:
        try:
            uid = int(payload["user_id"])
        except (TypeError, ValueError):
            return None
        if uid != sub_i:
            return None
        d = db.query(Driver).filter(Driver.user_id == uid).first()
        return int(d.id) if d is not None else None
    d = db.query(Driver).filter(Driver.id == sub_i).first()
    return int(d.id) if d is not None else None


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> User:
    """Load ``User`` from JWT ``sub`` (must be ``users.id``). Rejects legacy driver JWTs without ``user_id``."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None
    try:
        uid = int(str(payload.get("sub", "")))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    role = (payload.get("role") or "").lower()
    if role == "driver" and "user_id" not in payload:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid token for user context",
        )
    if "user_id" in payload:
        try:
            jwt_uid = int(payload["user_id"])
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        if jwt_uid != uid:
            raise HTTPException(
                status_code=HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return user


def get_current_role(required_roles: list[str]) -> Callable[..., User]:
    """``Depends(get_current_role([\"admin\", \"driver\"]))`` — requires an active user with one of the roles."""

    allowed = {str(r).strip().lower() for r in required_roles if str(r).strip()}

    def _dep(user: Annotated[User, Depends(get_current_active_user)]) -> User:
        if (user.role or "").strip().lower() not in allowed:
            raise HTTPException(
                status_code=HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _dep


def require_admin(payload: Annotated[dict, Depends(auth_payload)]) -> dict:
    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return payload


def require_driver(
    db: Annotated[Session, Depends(get_db)],
    payload: Annotated[dict, Depends(auth_payload)],
) -> dict:
    if payload.get("role") != "driver":
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Driver access required",
        )
    did = resolve_driver_id_from_auth_payload(db, payload)
    if did is None:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Driver not found",
        )
    out = {**payload, "sub": str(did)}
    return out


def require_bnb(payload: Annotated[dict, Depends(auth_payload)]) -> dict:
    if payload.get("role") != "bnb":
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="B&B access required",
        )
    return payload


def require_admin_or_driver_self(
    driver_id: int,
    db: Annotated[Session, Depends(get_db)],
    payload: Annotated[dict, Depends(auth_payload)],
) -> dict:
    role = payload.get("role")
    if role == "admin":
        return payload
    if role == "driver":
        resolved = resolve_driver_id_from_auth_payload(db, payload)
        if resolved is not None and resolved == int(driver_id):
            return payload
    raise HTTPException(
        status_code=HTTP_403_FORBIDDEN,
        detail="Not authorized for this driver",
    )


def require_trip_driver_or_admin(
    trip_id: int,
    db: Annotated[Session, Depends(get_db)],
    payload: Annotated[dict, Depends(auth_payload)],
) -> dict:
    if payload.get("role") == "admin":
        return payload
    if payload.get("role") != "driver":
        raise HTTPException(HTTP_403_FORBIDDEN, detail="Forbidden")
    trip = db.query(Trip).filter(Trip.id == int(trip_id)).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    did = getattr(trip, "driver_id", None)
    resolved = resolve_driver_id_from_auth_payload(db, payload)
    if did is None or resolved is None or int(did) != int(resolved):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Not assigned to this trip",
        )
    return payload


def require_ride_driver_or_admin(
    ride_id: int,
    db: Annotated[Session, Depends(get_db)],
    payload: Annotated[dict, Depends(auth_payload)],
) -> dict:
    """ride_id is the trip id used by `/rides/{ride_id}/...` in the driver app."""
    if payload.get("role") == "admin":
        return payload
    if payload.get("role") != "driver":
        raise HTTPException(HTTP_403_FORBIDDEN, detail="Forbidden")
    trip = db.query(Trip).filter(Trip.id == int(ride_id)).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    did = getattr(trip, "driver_id", None)
    resolved = resolve_driver_id_from_auth_payload(db, payload)
    if did is None or resolved is None or int(did) != int(resolved):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Not assigned to this trip",
        )
    return payload
