"""Stripe Connect onboarding for drivers and B&B providers (Express accounts)."""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette import status

from app.crud.driver import get_driver_by_email
from app.crud.user import get_user_by_email
from app.database import get_db
from app.models.driver import Driver
from app.models.provider import Provider
from app.services.stripe_connect_onboarding import (
    create_connect_account_onboarding_link,
    create_connect_express_account,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stripe", tags=["stripe"])


class StripeOnboardBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    type: Literal["driver", "bnb"]

    @field_validator("type", mode="before")
    @classmethod
    def _lower_type(cls, v: object) -> str:
        return str(v or "").strip().lower()


class StripeOnboardResponse(BaseModel):
    url: str


@router.post("/onboard", response_model=StripeOnboardResponse)
def stripe_connect_onboard(
    payload: StripeOnboardBody,
    db: Session = Depends(get_db),
) -> StripeOnboardResponse:
    """
    Create (or reuse) a Stripe Connect Express account for the driver or B&B row
    matching ``email``, persist ``stripe_account_id``, and return an Account Link URL.
    """
    email_norm = str(payload.email).strip().lower()
    if not email_norm or "@" not in email_norm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email",
        )

    if payload.type == "driver":
        row: Driver | None = get_driver_by_email(db, email_norm)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Driver not found for this email",
            )
        stripe_email = (row.email or email_norm).strip()
        meta = {"entity": "driver", "driver_id": str(int(row.id))}
    else:
        user = get_user_by_email(db, email_norm)
        if user is None or (getattr(user, "role", None) or "").strip().lower() != "bnb":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="B&B account not found for this email",
            )
        row = (
            db.query(Provider)
            .filter(
                Provider.user_id == int(user.id),
                func.lower(Provider.type) == "bnb",
            )
            .first()
        )
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="B&B provider row not found",
            )
        stripe_email = (user.email or email_norm).strip()
        meta = {"entity": "bnb", "provider_id": str(int(row.id))}

    existing = (getattr(row, "stripe_account_id", None) or "").strip()
    account_id = existing
    if not account_id:
        try:
            account_id = create_connect_express_account(stripe_email, metadata=meta)
        except RuntimeError as e:
            logger.warning("Stripe express create failed: %s", e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(e),
            ) from None
        row.stripe_account_id = account_id
        db.add(row)
        db.commit()
        db.refresh(row)

    try:
        url = create_connect_account_onboarding_link(account_id)
    except (RuntimeError, ValueError) as e:
        logger.warning("Stripe AccountLink failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from None

    return StripeOnboardResponse(url=url)
