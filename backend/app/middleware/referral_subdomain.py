"""Parse B&B referral from ``Host`` (and optionally ``Referer``) and attach to request state."""

from __future__ import annotations

from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.services.referral_booking import is_valid_referral_code_format, normalize_referral_code

# Do not treat these leading labels as referral codes.
_RESERVED_SUBDOMAIN_LABELS = frozenset(
    {"www", "api", "admin", "mail", "cdn", "app", "staging", "dev", "test"}
)


def referral_code_from_host(host: str | None) -> str | None:
    """
    Extract a referral-shaped label from the HTTP Host header.

    - ``rio5hx.sanculino.com`` → ``RIO5HX`` (first label, 3+ domain parts).
    - ``rio5hx.localhost`` → ``RIO5HX`` (``*.localhost`` in dev).
    - ``sanculino.com`` → ``None`` (no tenant subdomain).
    - Bracketed IPv6 and dotted IPv4 hosts → ``None``.
    """
    if host is None:
        return None
    raw = str(host).strip()
    if not raw:
        return None
    hostname = raw.split(":", 1)[0].strip().lower()
    if not hostname or hostname.startswith("["):
        return None

    parts = hostname.split(".")
    if len(parts) < 2:
        return None

    if all(p.isdigit() for p in parts):
        return None

    label: str | None = None
    if len(parts) >= 3:
        label = parts[0]
    elif len(parts) == 2 and parts[1] == "localhost":
        label = parts[0]
    else:
        return None

    if not label or label in _RESERVED_SUBDOMAIN_LABELS:
        return None

    code = normalize_referral_code(label)
    if code is None or not is_valid_referral_code_format(code):
        return None
    return code


def referral_code_from_referer(referer: str | None) -> str | None:
    """When API ``Host`` is not the tenant subdomain, checkout may send the page origin in ``Referer``."""
    if not referer or not str(referer).strip():
        return None
    try:
        parsed = urlparse(str(referer).strip())
        host = parsed.hostname
        if not host:
            return None
        return referral_code_from_host(host)
    except Exception:
        return None


class ReferralSubdomainMiddleware(BaseHTTPMiddleware):
    """Sets ``request.state.referral_subdomain`` for downstream handlers."""

    async def dispatch(self, request: Request, call_next) -> Response:
        host = request.headers.get("host")
        code = referral_code_from_host(host)
        if code is None:
            code = referral_code_from_referer(request.headers.get("referer"))
        request.state.referral_subdomain = code
        return await call_next(request)
