"""Unified ``POST /api/login`` (admin, B&B, driver on ``users``, legacy ``drivers``)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.auth import AdminLoginRequest, UnifiedLoginResponse, perform_unified_login

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=UnifiedLoginResponse)
def api_unified_login(
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
) -> UnifiedLoginResponse:
    return perform_unified_login(db, payload.email, payload.password)
