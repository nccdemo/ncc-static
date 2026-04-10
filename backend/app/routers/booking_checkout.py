"""POST /booking/create-checkout — Stripe Checkout for tour instances."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.booking_checkout import BookingCreateCheckoutRequest, BookingCreateCheckoutResponse
from app.schemas.tour_booking_checkout import TourBookingCheckoutCreate
from app.services.tour_stripe_booking import create_tour_booking_checkout
from app.utils.referral_from_host import get_referral_from_host

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/booking", tags=["booking"])


@router.post("/create-checkout", response_model=BookingCreateCheckoutResponse)
def booking_create_checkout(
    request: Request,
    payload: BookingCreateCheckoutRequest,
    db: Session = Depends(get_db),
) -> BookingCreateCheckoutResponse:
    """
    Validates availability, derives per-seat amount (instance ``price`` or ``tour.price × 1.25``),
    opens Stripe Checkout. Metadata includes at least ``tour_instance_id``, ``seats``,
    ``customer_name``, ``referral_code`` (plus existing keys required by the webhook).
    """
    try:
        inner = TourBookingCheckoutCreate(
            tour_instance_id=payload.tour_instance_id,
            seats=payload.seats,
            customer_name=payload.customer_name.strip(),
            email=str(payload.customer_email).strip(),
            phone=payload.customer_phone.strip(),
            referral_code=payload.referral_code,
            has_bnb=False,
        )
        body_ref = (payload.referral_code or "").strip()
        if not body_ref:
            referral = get_referral_from_host(request)
            print("Referral from host:", referral, flush=True)
            sub_ref = referral
        else:
            sub_ref = getattr(request.state, "referral_subdomain", None)
        out = create_tour_booking_checkout(
            db, inner, referral_query=None, referral_subdomain=sub_ref
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("booking_create_checkout failed")
        raise HTTPException(status_code=500, detail=str(e)) from e

    url = out.get("url") if isinstance(out, dict) else None
    if not url:
        raise HTTPException(status_code=500, detail="Checkout URL missing")
    return BookingCreateCheckoutResponse(checkout_url=str(url))
