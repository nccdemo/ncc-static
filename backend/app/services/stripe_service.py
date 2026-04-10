import logging
import os

import stripe

from app.config import FRONTEND_URL
from app.services.bnb_commission_transfer import _bnb_commission_rate
from app.services.referral_booking import normalize_referral_code

logger = logging.getLogger(__name__)

# Strip avoids verification failures from trailing spaces/newlines in .env
stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip() or None
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip() or None

PAYMENT_CANCEL_URL = f"{FRONTEND_URL}/payment-cancel"


def _tourist_client_base() -> str:
    """Public tourist app (Vite default :5173). Override with ``TOURIST_CLIENT_URL``."""
    return (os.getenv("TOURIST_CLIENT_URL") or "http://localhost:5173").rstrip("/")


def _tour_checkout_success_url() -> str:
    """Return URL after successful tour Checkout (Stripe expands ``{CHECKOUT_SESSION_ID}``)."""
    u = (os.getenv("STRIPE_TOUR_CHECKOUT_SUCCESS_URL") or "").strip()
    if u:
        return u
    return f"{_tourist_client_base()}/booking/success?session_id={{CHECKOUT_SESSION_ID}}"


def _tour_checkout_cancel_url() -> str:
    """Return URL when user cancels tour Checkout."""
    u = (os.getenv("STRIPE_TOUR_CHECKOUT_CANCEL_URL") or "").strip()
    if u:
        return u
    return f"{_tourist_client_base()}/tours?canceled=1"


def _payment_intent_metadata_from_session(metadata: dict) -> dict[str, str]:
    """Copy session metadata onto the PaymentIntent (for `payment_intent.succeeded` handlers)."""
    out: dict[str, str] = {}
    for k, v in metadata.items():
        if v is None:
            continue
        key = str(k)[:40]
        val = str(v).strip()
        if not val:
            continue
        out[key] = val[:500]
    return out


def _default_platform_fee_rate() -> float:
    raw = (os.getenv("STRIPE_PLATFORM_FEE_RATE") or "0.2").strip()
    try:
        r = float(raw)
    except ValueError:
        return 0.2
    return min(1.0, max(0.0, r))


def _application_fee_cents(amount_cents: int, rate: float) -> int:
    """Platform application fee in cents; remainder of the charge goes to the connected account."""
    if amount_cents <= 0:
        return 0
    fee = int(round(amount_cents * float(rate)))
    fee = max(0, min(fee, amount_cents))
    if fee >= amount_cents:
        fee = amount_cents - 1
    return max(0, fee)


def _tour_instance_connect_fee_split(
    total_cents: int,
    *,
    bnb_provider_id: int | None,
) -> tuple[int, int, int]:
    """
    Destination-charge fee split: platform + optional BNB slice stay on the platform account
    (``application_fee_amount``); driver receives the remainder. BNB slice is later transferred
    via ``apply_bnb_commission_for_payment_intent`` using metadata ``bnb_transfer_cents``.

    Returns (platform_fee_cents, bnb_fee_cents, application_fee_amount).
    """
    total_cents = int(total_cents)
    if total_cents < 1:
        return 0, 0, 0
    max_fee = max(0, total_cents - 1)
    p_rate = _default_platform_fee_rate()
    b_rate = _bnb_commission_rate() if bnb_provider_id is not None else 0.0
    orig_pf = max(0, int(round(total_cents * p_rate)))
    orig_bnb = max(0, int(round(total_cents * b_rate))) if bnb_provider_id is not None else 0
    app_target = orig_pf + orig_bnb
    app = min(app_target, max_fee)
    if app_target > 0 and app < app_target:
        bnb_c = int(round(app * orig_bnb / app_target)) if orig_bnb else 0
        bnb_c = max(0, min(bnb_c, app))
        pf_c = app - bnb_c
    else:
        pf_c, bnb_c = orig_pf, orig_bnb
        if pf_c + bnb_c > max_fee:
            if app_target > 0:
                bnb_c = int(round(max_fee * orig_bnb / app_target)) if orig_bnb else 0
                bnb_c = max(0, min(bnb_c, max_fee))
                pf_c = max_fee - bnb_c
            else:
                pf_c, bnb_c = max_fee, 0
    return pf_c, bnb_c, pf_c + bnb_c


def tour_checkout_split_eur_from_session_metadata(
    metadata: dict,
    total_cents: int,
    bnb_provider_id: int | None,
) -> tuple[float, float, float]:
    """
    Tour card checkout: (driver_eur, bnb_eur, platform_eur) matching Stripe destination
    charge + metadata ``platform_fee_cents`` / ``bnb_transfer_cents`` when present.
    """
    md = dict(metadata or {})
    total_cents = max(0, int(total_cents))
    if total_cents < 1:
        return 0.0, 0.0, 0.0
    pf_raw = md.get("platform_fee_cents")
    bnb_raw = md.get("bnb_transfer_cents")
    try:
        pf = int(pf_raw) if pf_raw is not None and str(pf_raw).strip() != "" else None
    except (TypeError, ValueError):
        pf = None
    try:
        bnb = int(bnb_raw) if bnb_raw is not None and str(bnb_raw).strip() != "" else None
    except (TypeError, ValueError):
        bnb = None
    if pf is not None and bnb is not None:
        app = pf + bnb
        drv_cents = max(0, total_cents - app)
    else:
        pf, bnb, app = _tour_instance_connect_fee_split(total_cents, bnb_provider_id=bnb_provider_id)
        drv_cents = max(0, total_cents - app)
    return round(drv_cents / 100.0, 2), round(bnb / 100.0, 2), round(pf / 100.0, 2)


class CheckoutSessionCreationError(Exception):
    """Raised when Stripe Checkout Session.create fails."""

    def __init__(self, message: str = "Pagamento non disponibile", *, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _checkout_session_create(**kwargs):
    try:
        return stripe.checkout.Session.create(**kwargs)
    except stripe.StripeError as e:
        logger.exception("Stripe checkout.Session.create failed: %s", e)
        raise CheckoutSessionCreationError("Pagamento non disponibile") from e


def create_simple_checkout_session(
    *,
    title: str,
    amount_eur: float,
) -> dict:
    """
    One-off Stripe Checkout (e.g. client-app tour preview): no DB booking; webhook ignores fulfillment.
    """
    title_clean = (title or "").strip()[:120] or "Tour"
    amount_eur = float(amount_eur)
    unit_cents = max(50, int(round(amount_eur * 100)))
    client_origin = (os.getenv("CLIENT_APP_URL") or "http://localhost:5173").rstrip("/")
    metadata = {"simple_checkout": "1", "title": title_clean[:120]}
    default_success = f"{client_origin}/?payment=success"
    default_cancel = f"{client_origin}/?payment=cancel"

    if stripe.api_key:
        session = _checkout_session_create(
            payment_method_types=["card"],
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": title_clean},
                        "unit_amount": unit_cents,
                    },
                    "quantity": 1,
                }
            ],
            metadata=metadata,
            success_url=os.getenv("STRIPE_CLIENT_CHECKOUT_SUCCESS_URL", default_success),
            cancel_url=os.getenv("STRIPE_CLIENT_CHECKOUT_CANCEL_URL", default_cancel),
        )
        url = session.url
        return {"url": url, "checkout_url": url, "session_id": session.id}

    mock_url = f"https://mock.stripe.local/checkout/simple?title={title_clean}&amount={amount_eur}"
    return {"url": mock_url, "checkout_url": mock_url, "session_id": "mock_cs_simple"}


def create_pending_booking_checkout_session(
    *,
    booking_id: int,
    amount_eur: float,
    customer_email: str,
    product_name: str,
    bnb_id: int | None = None,
) -> dict:
    """
    Stripe Checkout for an existing DB booking in status pending (pay after reserve).
    Webhook fulfills via metadata.booking_id.
    """
    metadata = {"booking_id": str(booking_id)}
    if bnb_id is not None:
        metadata["bnb_id"] = str(int(bnb_id))
    amount_eur = float(amount_eur)
    unit_cents = max(50, int(round(amount_eur * 100)))

    default_success = os.getenv(
        "STRIPE_BOOKING_SUCCESS_URL",
        f"{FRONTEND_URL}/payment-success?booking_id={booking_id}",
    )
    default_cancel = os.getenv("STRIPE_BOOKING_CANCEL_URL", PAYMENT_CANCEL_URL)

    if stripe.api_key:
        pi_md = _payment_intent_metadata_from_session(metadata)
        session = _checkout_session_create(
            payment_method_types=["card"],
            mode="payment",
            customer_email=customer_email,
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": product_name[:120]},
                        "unit_amount": unit_cents,
                    },
                    "quantity": 1,
                }
            ],
            metadata=metadata,
            payment_intent_data={"metadata": pi_md},
            success_url=os.getenv("STRIPE_SUCCESS_URL", default_success),
            cancel_url=os.getenv("STRIPE_CANCEL_URL", default_cancel),
        )
        return {"url": session.url, "session_id": session.id}

    return {
        "url": f"https://mock.stripe.local/booking/{booking_id}/checkout?amount={amount_eur}",
        "session_id": f"mock_cs_booking_{booking_id}",
    }


def create_pending_quote_checkout_session(
    *,
    quote_id: int,
    amount_eur: float,
    customer_email: str,
    product_name: str,
) -> dict:
    """Stripe Checkout for a Quote (custom ride). Webhook fulfills via metadata.quote_id."""
    metadata = {"quote_id": str(quote_id)}
    amount_eur = float(amount_eur)
    unit_cents = max(50, int(round(amount_eur * 100)))

    default_success = os.getenv(
        "STRIPE_QUOTE_SUCCESS_URL",
        f"{FRONTEND_URL}/payment-success?quote_id={quote_id}",
    )
    default_cancel = os.getenv("STRIPE_QUOTE_CANCEL_URL", PAYMENT_CANCEL_URL)

    if stripe.api_key:
        session = _checkout_session_create(
            payment_method_types=["card"],
            mode="payment",
            customer_email=customer_email,
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": product_name[:120]},
                        "unit_amount": unit_cents,
                    },
                    "quantity": 1,
                }
            ],
            metadata=metadata,
            success_url=os.getenv("STRIPE_SUCCESS_URL", default_success),
            cancel_url=os.getenv("STRIPE_CANCEL_URL", default_cancel),
        )
        return {"url": session.url, "session_id": session.id}

    return {
        "url": f"https://mock.stripe.local/quote/{quote_id}/checkout?amount={amount_eur}",
        "session_id": f"mock_cs_quote_{quote_id}",
    }


def create_checkout_session(amount: float, booking_id: int, bnb_id: int | None = None) -> dict:
    """Create Stripe checkout session or return mock fallback (legacy: amount from caller)."""
    metadata = {"booking_id": str(booking_id)}
    if bnb_id is not None:
        metadata["bnb_id"] = str(int(bnb_id))
    unit_cents = max(50, int(round(float(amount) * 100)))
    if stripe.api_key:
        default_success_url = f"{FRONTEND_URL}/payment-success?booking_id={booking_id}"
        default_cancel_url = PAYMENT_CANCEL_URL
        pi_md = _payment_intent_metadata_from_session(metadata)
        session = _checkout_session_create(
            payment_method_types=["card"],
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": f"NCC Booking #{booking_id}"},
                        "unit_amount": unit_cents,
                    },
                    "quantity": 1,
                }
            ],
            metadata=metadata,
            payment_intent_data={"metadata": pi_md},
            success_url=os.getenv("STRIPE_SUCCESS_URL", default_success_url),
            cancel_url=os.getenv("STRIPE_CANCEL_URL", default_cancel_url),
        )
        return {
            "url": session.url,
            "checkout_url": session.url,
            "session_id": session.id,
            "amount": amount,
            "currency": "eur",
            "metadata": metadata,
        }

    mock_url = f"https://mock.stripe.local/checkout/{booking_id}"
    return {
        "url": mock_url,
        "checkout_url": mock_url,
        "session_id": f"mock_session_{booking_id}",
        "amount": amount,
        "currency": "eur",
        "metadata": metadata,
    }


def create_tour_checkout_session(
    *,
    tour_id: int,
    tour_instance_id: int,
    tour_title: str,
    unit_amount_eur: float,
    passengers: int,
    customer_email: str,
    name: str,
    date: str,
    has_bnb: bool = False,
) -> dict:
    """
    Create a Stripe Checkout Session for a tour booking.

    Note: This does NOT create a booking in DB. We rely on Stripe metadata for later fulfillment.
    """
    email = customer_email
    metadata = {
        "tour_id": str(tour_id),
        "tour_instance_id": str(tour_instance_id),
        "name": str(name),
        "email": str(email),
        "date": str(date),
        "passengers": str(passengers),
        "has_bnb": "true" if has_bnb else "false",
    }

    if stripe.api_key:
        logger.debug(
            "Creating tour checkout metadata tour_id=%s tour_instance_id=%s",
            tour_id,
            tour_instance_id,
        )
        session = _checkout_session_create(
            payment_method_types=["card"],
            mode="payment",
            customer_email=customer_email,
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": tour_title},
                        "unit_amount": int(unit_amount_eur * 100),
                    },
                    "quantity": passengers,
                }
            ],
            metadata={
                "tour_id": str(tour_id),
                "tour_instance_id": str(tour_instance_id),
                "name": str(name),
                "email": str(email),
                "date": str(date),
                "passengers": str(passengers),
                "has_bnb": "true" if has_bnb else "false",
            },
            success_url=_tour_checkout_success_url(),
            cancel_url=_tour_checkout_cancel_url(),
        )
        return {"url": session.url}

    # Local/dev fallback when STRIPE_SECRET_KEY is not set.
    return {"url": f"https://mock.stripe.local/tours/{tour_id}/checkout?qty={passengers}"}


def create_tour_instance_checkout_session(
    *,
    unit_amount_eur: float,
    people: int,
    tour_id: int,
    tour_instance_id: int,
    customer_name: str,
    email: str,
    phone: str | None = None,
    instance_date_iso: str,
    has_bnb: bool = False,
    referral_code: str | None = None,
    bnb_id: int | None = None,
    driver_id: int | None = None,
    connect_destination_account_id: str | None = None,
) -> dict:
    """
    Stripe Checkout for a tour instance. Does not create a booking — webhook fulfills after payment.

    With Connect ``connect_destination_account_id`` (driver ``acct_…``), uses a destination charge:
    ``application_fee_amount`` = platform fee (+ BNB slice when ``bnb_id`` is set); the driver
    receives the net amount. After payment, ``bnb_transfer_cents`` in metadata drives the BNB
    ``Transfer`` in ``apply_bnb_commission_for_payment_intent``.
    """
    phone_s = (phone or "").strip()
    metadata = {
        "tour_id": str(tour_id),
        "tour_instance_id": str(tour_instance_id),
        "name": str(customer_name),
        "customer_name": str(customer_name)[:500],
        "email": str(email),
        "passengers": str(people),
        "seats": str(people),
        "date": str(instance_date_iso),
        "has_bnb": "true" if has_bnb else "false",
        "driver_id": str(int(driver_id)) if driver_id is not None else "",
    }
    if phone_s:
        metadata["customer_phone"] = phone_s[:500]
        metadata["phone"] = phone_s[:500]
    rc = normalize_referral_code(referral_code)
    if rc:
        metadata["referral_code"] = rc[:500]
    if bnb_id is not None:
        metadata["bnb_id"] = str(int(bnb_id))
    unit_cents = int(round(float(unit_amount_eur) * 100))
    total_cents = max(0, int(unit_cents) * int(people))
    platform_cents, bnb_fee_cents, application_fee_amount = _tour_instance_connect_fee_split(
        total_cents,
        bnb_provider_id=bnb_id,
    )
    metadata["platform_fee_cents"] = str(platform_cents)
    metadata["bnb_transfer_cents"] = str(bnb_fee_cents)
    # Webhook: driver share is settled via Connect destination charge — skip separate Transfer.
    metadata["connect_destination_charge"] = "true"

    if stripe.api_key:
        dest = (connect_destination_account_id or "").strip()
        if not dest:
            raise CheckoutSessionCreationError(
                "Autista non collegato a Stripe Connect: impossibile creare il pagamento",
                status_code=400,
            )
        pi_md = _payment_intent_metadata_from_session(metadata)
        payment_intent_data: dict = {
            "metadata": pi_md,
            "application_fee_amount": application_fee_amount,
            "transfer_data": {"destination": dest},
        }
        session = _checkout_session_create(
            payment_method_types=["card"],
            mode="payment",
            customer_email=email,
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": "Tour Booking"},
                        "unit_amount": unit_cents,
                    },
                    "quantity": people,
                }
            ],
            metadata=metadata,
            payment_intent_data=payment_intent_data,
            success_url=_tour_checkout_success_url(),
            cancel_url=_tour_checkout_cancel_url(),
        )
        return {"url": session.url}

    return {
        "url": f"https://mock.stripe.local/payments/create-checkout?tour_instance_id={tour_instance_id}&people={people}",
    }


def create_ride_payment_intent(
    *,
    amount_eur: float,
    ride_id: int,
    booking_id: int,
    bnb_id: int | None,
    referral_code: str | None,
    connect_destination_account_id: str | None = None,
    platform_fee_rate: float | None = None,
) -> dict:
    """
    PaymentIntent for driver-app card payment on a ride.

    If ``connect_destination_account_id`` is set (Stripe Connect ``acct_…``), uses a
    destination charge with ``application_fee_amount`` (platform) and
    ``transfer_data.destination`` (driver). Otherwise behaves like a standard
    platform PaymentIntent (existing behavior).
    """
    if not stripe.api_key:
        raise CheckoutSessionCreationError("Stripe non configurato")

    amount_cents = max(50, int(round(float(amount_eur) * 100)))
    metadata = {
        "ride_id": str(ride_id),
        "booking_id": str(booking_id),
        "bnb_id": str(bnb_id) if bnb_id is not None else "",
        "referral_code": (normalize_referral_code(referral_code) or "")[:500],
    }
    params: dict = {
        "amount": amount_cents,
        "currency": "eur",
        "metadata": metadata,
        "description": f"NCC ride #{ride_id}",
    }

    dest = (connect_destination_account_id or "").strip()
    if dest:
        rate = _default_platform_fee_rate() if platform_fee_rate is None else float(platform_fee_rate)
        rate = min(1.0, max(0.0, rate))
        fee_cents = _application_fee_cents(amount_cents, rate)
        params["application_fee_amount"] = fee_cents
        params["transfer_data"] = {"destination": dest}

    try:
        intent = stripe.PaymentIntent.create(**params)
    except stripe.StripeError as e:
        logger.exception("Stripe PaymentIntent.create failed: %s", e)
        raise CheckoutSessionCreationError("Pagamento non disponibile") from e

    return {"client_secret": intent.client_secret, "payment_intent_id": intent.id}


def construct_stripe_event(payload: bytes, signature: str | None):
    if not STRIPE_WEBHOOK_SECRET:
        return stripe.Event.construct_from(
            {
                "type": "checkout.session.completed",
                "data": {"object": {}},
            },
            stripe.api_key or "",
        )
    if not signature:
        raise ValueError("Missing Stripe signature header")
    return stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
