"""Public referral visit tracking (landing loads)."""

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette import status

from app.database import get_db
from app.models.referral_visit import ReferralVisit
from app.services.referral_booking import is_valid_referral_code_format, normalize_referral_code

router = APIRouter(prefix="/referral", tags=["referral-tracking"])


class ReferralVisitIn(BaseModel):
    referral_code: str = Field(..., min_length=1, max_length=64)


class ReferralVisitOut(BaseModel):
    referral_code: str
    visited_at: str


@router.post("/visit", response_model=ReferralVisitOut, status_code=status.HTTP_201_CREATED)
def record_referral_visit(
    payload: ReferralVisitIn,
    db: Session = Depends(get_db),
) -> ReferralVisitOut:
    code = normalize_referral_code(payload.referral_code)
    if code is None or not is_valid_referral_code_format(code):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid referral_code",
        )
    row = ReferralVisit(referral_code=code)
    db.add(row)
    db.commit()
    db.refresh(row)
    visited = row.visited_at.isoformat() if row.visited_at is not None else ""
    return ReferralVisitOut(referral_code=code, visited_at=visited)
