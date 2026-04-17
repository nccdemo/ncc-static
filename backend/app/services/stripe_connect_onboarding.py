"""Stripe Connect Express: create connected accounts and Account Links for onboarding."""

from __future__ import annotations

import logging
import os
from typing import Any

import stripe
from stripe import StripeError

from app.config import STRIPE_CHECKOUT_RETURN_BASE

logger = logging.getLogger(__name__)

stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip() or None


def connect_onboarding_refresh_url() -> str:
    u = (os.getenv("STRIPE_CONNECT_ONBOARDING_REFRESH_URL") or "").strip()
    if u:
        return u
    return f"{STRIPE_CHECKOUT_RETURN_BASE}/onboarding/refresh"


def connect_onboarding_return_url() -> str:
    u = (os.getenv("STRIPE_CONNECT_ONBOARDING_RETURN_URL") or "").strip()
    if u:
        return u
    return f"{STRIPE_CHECKOUT_RETURN_BASE}/onboarding/success"


def create_connect_express_account(
    email: str,
    *,
    metadata: dict[str, str] | None = None,
) -> str:
    """Create a Stripe Connect Express account; return ``acct_…`` id."""
    if not stripe.api_key:
        raise RuntimeError("Stripe non configurato")

    params: dict[str, Any] = {
        "type": "express",
        "email": (email or "").strip(),
        "capabilities": {
            "card_payments": {"requested": True},
            "transfers": {"requested": True},
        },
    }
    if metadata:
        clean = {str(k)[:40]: str(v)[:500] for k, v in metadata.items() if v is not None}
        if clean:
            params["metadata"] = clean

    try:
        account = stripe.Account.create(**params)
    except StripeError as e:
        logger.exception("Stripe Account.create failed: %s", e)
        raise RuntimeError("Impossibile creare l’account Stripe Connect") from e

    aid = str(getattr(account, "id", "") or "").strip()
    if not aid:
        raise RuntimeError("Risposta Stripe senza account id")
    logger.info("Stripe Express Connect account created: account_id=%s", aid)
    return aid


def create_connect_account_onboarding_link(
    account_id: str,
    *,
    refresh_url: str | None = None,
    return_url: str | None = None,
) -> str:
    """Create a short-lived Account Link URL for Express onboarding."""
    if not stripe.api_key:
        raise RuntimeError("Stripe non configurato")

    aid = (account_id or "").strip()
    if not aid:
        raise ValueError("account_id mancante")

    ref = (refresh_url or "").strip() or connect_onboarding_refresh_url()
    ret = (return_url or "").strip() or connect_onboarding_return_url()

    try:
        link = stripe.AccountLink.create(
            account=aid,
            refresh_url=ref,
            return_url=ret,
            type="account_onboarding",
        )
    except StripeError as e:
        logger.exception("Stripe AccountLink.create failed: %s", e)
        raise RuntimeError("Impossibile generare il link di onboarding") from e

    url = str(getattr(link, "url", "") or "").strip()
    if not url:
        raise RuntimeError("Risposta Stripe senza URL")
    return url
