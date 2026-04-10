"""Public tour booking: Stripe Checkout Session → webhook creates ``Booking``."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.tour_booking_checkout import TourBookingCheckoutCreate
from app.services.tour_stripe_booking import create_tour_booking_checkout
from app.utils.referral_from_host import get_referral_from_host

router = APIRouter(prefix="/tour-bookings", tags=["tour-bookings"])


@router.post("/checkout-session")
def create_tour_booking_checkout_session(
    request: Request,
    payload: TourBookingCheckoutCreate,
    db: Session = Depends(get_db),
    ref: Annotated[
        str | None,
        Query(description="Referral code from landing page ?ref=CODE (if body omits referral_code)"),
    ] = None,
) -> dict:
    """
    Start payment for a tour instance. On successful Stripe Checkout, the webhook creates the
    ``Booking`` (with ``referral_code`` / ``bnb_id``, ``driver_id``, ``seats``), records
    ``Payment`` with B&B share, and runs Connect / commission transfers.
    """
    try:
        body_ref = (payload.referral_code or "").strip()
        if not body_ref:
            referral = get_referral_from_host(request)
            print("Referral from host:", referral, flush=True)
            sub_ref = referral
        else:
            sub_ref = getattr(request.state, "referral_subdomain", None)
        return create_tour_booking_checkout(
            db,
            payload,
            referral_query=ref,
            referral_subdomain=sub_ref,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
