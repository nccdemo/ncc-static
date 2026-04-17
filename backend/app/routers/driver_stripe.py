"""JWT-scoped Stripe Connect onboarding for drivers (Express + Account Links)."""

from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

import stripe
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_driver
from app.models.driver import Driver
from app.models.user import User
from app.services.stripe_connect_onboarding import (
    create_connect_account_onboarding_link,
    create_connect_express_account,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/driver/stripe", tags=["driver-stripe"])


def _driver_app_base() -> str:
    return (os.getenv("DRIVER_APP_URL") or "http://localhost:5174").rstrip("/")


def _connect_onboarding_allowed_hosts() -> set[str]:
    """Hostnames allowed for optional ``app_origin`` (portal + driver app + env)."""
    hosts: set[str] = set()
    for key in ("STRIPE_CONNECT_ONBOARDING_HOSTS", "STRIPE_CHECKOUT_RETURN_HOSTS"):
        raw = os.getenv(key) or ""
        for part in raw.split(","):
            h = part.strip().lower()
            if h:
                hosts.add(h)
    for env_key in ("DRIVER_APP_URL", "PORTAL_PUBLIC_URL", "NCC_PORTAL_URL"):
        base = (os.getenv(env_key) or "").strip()
        if not base:
            continue
        try:
            u = urlparse(base if "://" in base else f"https://{base}")
            if u.hostname:
                hosts.add(u.hostname.lower())
        except Exception:
            continue
    if not hosts:
        hosts.update({"localhost", "127.0.0.1"})
    return hosts


def _validated_app_origin(raw: str | None) -> str | None:
    """
    ``https://host[:port]`` only; host must be allowlisted so Stripe redirects stay on your apps.
    """
    if raw is None:
        return None
    s = str(raw).strip().rstrip("/")
    if not s:
        return None
    try:
        u = urlparse(s if "://" in s else f"https://{s}")
    except Exception:
        return None
    if u.scheme not in ("http", "https") or not u.hostname:
        return None
    host = u.hostname.lower()
    if host not in _connect_onboarding_allowed_hosts():
        return None
    netloc = host
    if u.port and u.port not in (80, 443):
        netloc = f"{host}:{u.port}"
    return f"{u.scheme}://{netloc}"


def _onboarding_urls(app_base: str | None = None) -> tuple[str, str]:
    base = (_validated_app_origin(app_base) or _driver_app_base()).rstrip("/")
    return f"{base}/driver/stripe/refresh", f"{base}/driver/stripe/success"


class DriverStripeConnectBody(BaseModel):
    """Optional client origin so Stripe returns to the same app (driver-app vs portal)."""

    app_origin: str | None = Field(
        default=None,
        description="e.g. https://localhost:5180 — must match STRIPE_CONNECT_ONBOARDING_HOSTS / portal URL",
    )


def _resolve_driver_email(db: Session, driver: Driver) -> str:
    em = (getattr(driver, "email", None) or "").strip()
    if em:
        return em
    uid = getattr(driver, "user_id", None)
    if uid is not None:
        u = db.query(User).filter(User.id == int(uid)).first()
        if u is not None:
            ue = (getattr(u, "email", None) or "").strip()
            if ue:
                return ue
    return ""


@router.post("/connect")
def driver_stripe_connect(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
    body: DriverStripeConnectBody | None = Body(default=None),
) -> dict:
    did = int(auth["sub"])
    driver = db.query(Driver).filter(Driver.id == did).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip() or None
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    acct = (getattr(driver, "stripe_account_id", None) or "").strip()
    if not acct:
        email = _resolve_driver_email(db, driver)
        if not email:
            raise HTTPException(
                status_code=400,
                detail="Email richiesta per Stripe: aggiorna il profilo autista.",
            )
        acct = create_connect_express_account(
            email,
            metadata={"driver_id": str(did), "role": "driver"},
        )
        driver.stripe_account_id = acct
        db.add(driver)
        db.commit()
        db.refresh(driver)

    app_origin = body.app_origin if body else None
    refresh_url, return_url = _onboarding_urls(app_origin)
    url = create_connect_account_onboarding_link(
        acct,
        refresh_url=refresh_url,
        return_url=return_url,
    )
    return {"url": url}


@router.get("/status")
def driver_stripe_status(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_driver),
) -> dict:
    did = int(auth["sub"])
    driver = db.query(Driver).filter(Driver.id == did).first()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    acct = (getattr(driver, "stripe_account_id", None) or "").strip()
    if not acct:
        return {
            "connected": False,
            "charges_enabled": False,
            "payouts_enabled": False,
        }

    stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip() or None
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    try:
        logger.info("Retrieving Stripe Connect account for driver_id=%s account_id=%s", did, acct)
        account = stripe.Account.retrieve(acct)
    except stripe.StripeError as e:
        logger.exception("Stripe Account.retrieve failed driver_id=%s: %s", did, e)
        raise HTTPException(status_code=502, detail="Stripe unavailable") from e

    return {
        "connected": True,
        "charges_enabled": bool(account.get("charges_enabled")),
        "payouts_enabled": bool(account.get("payouts_enabled")),
    }
