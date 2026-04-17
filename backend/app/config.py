import os

# Public base URL of the web app (emails, Stripe return URLs). No trailing slash.
FRONTEND_URL = (os.getenv("FRONTEND_URL") or "http://localhost:5176").rstrip("/")

# Browser redirects after Stripe Checkout for tour flows (portal default :5177).
# Override with CLIENT_URL or STRIPE_CHECKOUT_RETURN_URL. No trailing slash.
STRIPE_CHECKOUT_RETURN_BASE = (
    os.getenv("STRIPE_CHECKOUT_RETURN_URL") or os.getenv("CLIENT_URL") or "http://localhost:5177"
).rstrip("/")

# Public base URL of this API (embedded images in HTML emails, e.g. /static/logo.png). No trailing slash.
API_PUBLIC_URL = (os.getenv("API_PUBLIC_URL") or "http://localhost:8000").rstrip("/")

# Nominatim (OpenStreetMap) — identify your app; see https://operations.osmfoundation.org/policies/nominatim/
NOMINATIM_USER_AGENT = os.getenv("NOMINATIM_USER_AGENT") or "NCC-Backend/1.0"


def public_tracking_url(tracking_token: str | None) -> str:
    """Public tracking page on the web app (reads ``FRONTEND_URL`` from the environment)."""
    tok = (tracking_token or "").strip()
    if not tok:
        return FRONTEND_URL
    return f"{FRONTEND_URL}/track/{tok}"
