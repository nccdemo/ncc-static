"""Public B&B registration: ``users`` row (role ``bnb``) + ``providers`` row with referral code."""

import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette import status

from app.crud.user import get_user_by_email
from app.database import get_db
from app.models.provider import Provider
from app.models.user import User
from app.services.referral_booking import allocate_unique_bnb_referral_code, normalize_referral_code
from app.services.user_passwords import hash_user_password

router = APIRouter(prefix="/bnb", tags=["bnb"])


class BnbRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    phone: str = Field(..., min_length=1, max_length=40)


class BnbRegisterResponse(BaseModel):
    referral_code: str


@router.post("/register", response_model=BnbRegisterResponse, status_code=status.HTTP_201_CREATED)
def bnb_register(
    payload: BnbRegisterRequest,
    db: Session = Depends(get_db),
) -> BnbRegisterResponse:
    """
    Create a ``users`` row and linked ``providers`` row (``type=bnb``).
    ``name`` / ``phone`` are validated for the request contract; only email is stored on ``users`` today.
    """
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email")

    if get_user_by_email(db, email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    code = allocate_unique_bnb_referral_code(db)
    provisional_password = secrets.token_urlsafe(24)
    user = User(
        email=email,
        password_hash=hash_user_password(provisional_password),
        role="bnb",
        is_active=True,
    )
    db.add(user)

    try:
        db.flush()
        uid = int(user.id)
        if uid < 1:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration failed: user id not assigned",
            )
        # ``Provider.user_id`` must always be set so B&B APIs resolve the row by ``users.id``.
        db.add(
            Provider(
                user_id=uid,
                type="bnb",
                name=(payload.name or "").strip() or None,
                referral_code=normalize_referral_code(code) or code,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None

    return BnbRegisterResponse(referral_code=normalize_referral_code(code) or code)
