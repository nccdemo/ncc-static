"""
Stripe webhooks: signature verification and dispatch live in
:func:`app.routers.payments.stripe_payments_webhook`.

This router exposes the same handler at ``POST /api/stripe/webhook`` so Stripe CLI / dashboard
URLs that use that path stay valid. Prefer ``POST /api/payments/webhook`` or ``POST /api/webhooks/stripe``.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.payments import stripe_payments_webhook

router = APIRouter()


@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Thin alias: verifies Stripe signature and handles ``checkout.session.completed`` (tours, quotes, rides)."""
    return await stripe_payments_webhook(request, db)
