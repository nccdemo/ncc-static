"""B&B partner dashboard: referral code + aggregates from confirmed bookings."""

import logging
import os
import re
from urllib.parse import unquote

import jwt
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from starlette import status

from app.config import API_PUBLIC_URL
from app.database import get_db
from app.deps.auth import bnb_dashboard_dev_bypass_enabled, get_bnb_dashboard_identity, require_bnb
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.provider import Provider
from app.models.user import User
from app.services.jwt_auth import decode_access_token
from app.services.payment_ledger import platform_bnb_driver_amounts
from app.schemas.provider import ProviderResponse
from app.services.bnb_branding_upload import (
    save_bnb_branding_upload,
    save_bnb_cover_png_fixed,
    save_bnb_logo_png_fixed,
)
from app.services.referral_booking import is_valid_referral_code_format, normalize_referral_code

logger = logging.getLogger(__name__)

router = APIRouter(tags=["bnb"])

_PUBLIC_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_PUBLIC_SLUG_RESERVED = frozenset({"qr"})


def _parse_public_slug_raw(raw: str) -> str | None:
    """Return normalized slug or ``None`` if invalid / reserved."""
    s = (raw or "").strip().lower()
    if len(s) < 3 or len(s) > 64:
        return None
    if s in _PUBLIC_SLUG_RESERVED or not _PUBLIC_SLUG_RE.fullmatch(s):
        return None
    return s


_bearer_optional = HTTPBearer(auto_error=False)


def _bnb_user_from_bearer(creds: HTTPAuthorizationCredentials | None) -> dict | None:
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        return None
    if payload.get("role") != "bnb":
        return None
    try:
        uid = int(str(payload.get("sub", "")))
    except (TypeError, ValueError):
        return None
    return {"id": uid}


def get_bnb_caller_optional(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_optional)],
) -> dict | None:
    """Dev bypass: fixed user id. Production: JWT Bearer with role ``bnb``, else ``None``."""
    if bnb_dashboard_dev_bypass_enabled():
        return {"id": 1}
    return _bnb_user_from_bearer(creds)

_EXACT_AGG_SQL = text(
    """
    SELECT COUNT(*)::int AS total_bookings,
           COALESCE(SUM(price), 0)::float AS total_earnings
    FROM bookings
    WHERE referral_code = :rc
      AND status = 'confirmed'
    """
)

_FALLBACK_BY_BNB_SQL = text(
    """
    SELECT COUNT(*)::int AS total_bookings,
           COALESCE(SUM(price), 0)::float AS total_earnings
    FROM bookings
    WHERE bnb_id = :pid
      AND status = 'confirmed'
    """
)

_ILIKE_PROBE_SQL = text(
    """
    SELECT referral_code, status, price
    FROM bookings
    WHERE referral_code ILIKE '%' || :pat || '%'
    LIMIT 20
    """
)


class BnbDashboardResponse(BaseModel):
    referral_code: str
    total_bookings: int
    total_earnings: float = Field(
        ...,
        description="Sum of booking ``price`` for confirmed rows matching this referral (or bnb_id fallback).",
    )
    public_slug: str | None = Field(
        None,
        description="URL path segment for the public landing ``/bnb/{public_slug}`` (lowercase).",
    )


class BnbPaymentEarningsResponse(BaseModel):
    referral_code: str
    payment_count: int
    total_bookings: int = Field(
        0,
        description="Confirmed bookings tied to this B&B (``bnb_id``) or referral code.",
    )
    total_gross: float
    total_bnb_earnings: float
    total_platform: float
    total_driver: float


class BnbMeMinimalResponse(BaseModel):
    """Slim payload (legacy ``GET /api/bnb/me`` removed; use ``GET /api/bnb/partner/me``)."""

    email: str | None = None
    referral_code: str = ""
    name: str = Field("", description="Struttura: ``display_name`` o ``name`` sul provider.")
    logo_url: str | None = None


class BnbMeResponse(ProviderResponse):
    """Logged-in B&B partner (``providers`` row linked to ``users``)."""

    id: int = Field(..., description="B&B provider id (use as ``bnb_id`` on earnings).")
    referral_code: str = ""
    email: str | None = None
    total_earnings: float = Field(
        0.0,
        description="Accumulated B&amp;B commission on ``providers.total_earnings``.",
    )
    public_slug: str | None = Field(
        None,
        description="Vanity path for public client landing (``/bnb/{slug}``).",
    )


class BnbMeUpdate(BaseModel):
    """Partial update for B&amp;B branding (only sent fields are applied)."""

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = None
    logo_url: str | None = None
    cover_image_url: str | None = None
    public_slug: str | None = None


class BnbPublicResponse(BaseModel):
    """Public B&B branding resolved from referral code."""

    display_name: str
    logo_url: str | None = None
    cover_image_url: str | None = None
    city: str | None = None


class BnbPublicBySlugResponse(BnbPublicResponse):
    """Public B&B landing payload: branding + referral for client auto-attribution."""

    referral_code: str
    public_slug: str


class BnbByReferralResponse(BaseModel):
    """Public B&amp;B snippet: ``name`` = linked user email or business name; raw asset paths."""

    name: str
    logo_url: str | None = None
    cover_image_url: str | None = None


def _provider_optional_str(value: object) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _absolute_public_asset_url(stored: str | None) -> str | None:
    """Turn stored relative ``/uploads/...`` paths into absolute URLs for public clients."""
    s = _provider_optional_str(stored)
    if s is None:
        return None
    if s.startswith("http://") or s.startswith("https://"):
        return s
    if s.startswith("/"):
        return f"{API_PUBLIC_URL}{s}"
    return f"{API_PUBLIC_URL}/{s}"


def _normalize_branding_url_input(raw: str | None) -> str | None:
    """Accept absolute http(s) URLs or app-relative upload/static paths."""
    s = _provider_optional_str(raw)
    if s is None:
        return None
    if s.startswith("http://") or s.startswith("https://"):
        return s
    if s.startswith("/uploads/") or s.startswith("/static/"):
        return s
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="logo_url e cover_image_url devono essere URL http(s) o percorsi che iniziano con /uploads/ o /static/.",
    )


def _bnb_me_minimal(prov: Provider, user_email: str | None) -> BnbMeMinimalResponse:
    rc = normalize_referral_code(getattr(prov, "referral_code", None)) or ""
    email_out = (str(user_email).strip() if user_email else None) or None
    display = _provider_optional_str(getattr(prov, "display_name", None))
    legacy = _provider_optional_str(getattr(prov, "name", None))
    name_out = display or legacy or ""
    return BnbMeMinimalResponse(
        email=email_out,
        referral_code=rc,
        name=name_out,
        logo_url=_provider_optional_str(getattr(prov, "logo_url", None)),
    )


def _bnb_me_response(prov: Provider, user_email: str | None) -> BnbMeResponse:
    rc = normalize_referral_code(getattr(prov, "referral_code", None)) or ""
    email_out = (str(user_email).strip() if user_email else None) or None
    slug_out = _provider_optional_str(getattr(prov, "public_slug", None))
    if slug_out:
        slug_out = slug_out.strip().lower()
    return BnbMeResponse(
        id=int(prov.id),
        referral_code=rc,
        email=email_out,
        total_earnings=round(float(prov.total_earnings or 0.0), 2),
        logo_url=_provider_optional_str(getattr(prov, "logo_url", None)),
        cover_image_url=_provider_optional_str(getattr(prov, "cover_url", None)),
        display_name=_provider_optional_str(getattr(prov, "display_name", None)),
        public_slug=slug_out,
    )


_BNB_PROFILE_NOT_FOUND = "B&B provider profile not found"
_BNB_PROFILE_NOT_FOUND_BODY = {"error": _BNB_PROFILE_NOT_FOUND}


def _http_detail_is_bnb_profile_not_found(detail: object) -> bool:
    if detail == _BNB_PROFILE_NOT_FOUND:
        return True
    if isinstance(detail, dict) and detail.get("error") == _BNB_PROFILE_NOT_FOUND:
        return True
    return False


def _raise_bnb_profile_not_found() -> None:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=_BNB_PROFILE_NOT_FOUND_BODY,
    )


def _bnb_type_is_bnb_clause():
    """Match ``providers.type`` as B&B: trim whitespace, case-insensitive ``bnb``."""
    return func.trim(Provider.type).ilike("bnb")


def _validate_public_slug_for_update(db: Session, prov: Provider, raw: str | None) -> str | None:
    """
    ``None`` clears the slug. Non-empty string must be unique among B&B providers (case-insensitive).
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    norm = _parse_public_slug_raw(s)
    if norm is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug non valido: usa 3–64 caratteri, lettere minuscole, numeri e trattini (es. sanculino-hotel). "
            "Non usare slug riservati.",
        )
    taken = (
        db.query(Provider.id)
        .filter(
            Provider.id != int(prov.id),
            _bnb_type_is_bnb_clause(),
            func.lower(Provider.public_slug) == norm,
        )
        .first()
    )
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questo slug è già in uso. Scegline un altro.",
        )
    return norm


# LEGACY BNB — ``_bnb_provider_and_email_for_user`` removed; use ``_resolve_bnb_provider_row_and_email``.
# def _bnb_provider_and_email_for_user(db: Session, current_user_id: int) -> tuple[Provider, str | None]:
#     return _resolve_bnb_provider_row_and_email(db, current_user_id)


def _resolve_bnb_provider_row_and_email(db: Session, current_user_id: int) -> tuple[Provider, str | None]:
    """
    Resolve the B&B ``Provider`` for the logged-in user: ``Provider.user_id == users.id``
    (JWT ``sub`` / dashboard identity ``id``), ``type`` trimmed and matching ``bnb`` (case-insensitive).
    """
    uid = int(current_user_id)
    if os.getenv("DEBUG_BNB_PROVIDER_LOOKUP", "").lower() in ("1", "true", "yes"):
        print("DEBUG current_user_id:", uid, type(uid), flush=True)
        for p in db.query(Provider).order_by(Provider.id).all():
            print("PROVIDER:", p.id, p.user_id, repr(p.type), flush=True)

    type_clause = _bnb_type_is_bnb_clause()
    row = (
        db.query(Provider, User.email)
        .outerjoin(User, User.id == Provider.user_id)
        .filter(Provider.user_id == uid)
        .filter(type_clause)
        .first()
    )
    if row is None:
        logger.debug("bnb provider lookup miss user_id=%s", uid)
        _raise_bnb_profile_not_found()
    return row


def _bnb_provider_for_user(db: Session, current_user_id: int) -> Provider:
    prov, _ = _resolve_bnb_provider_row_and_email(db, current_user_id)
    return prov


def _bnb_provider_for_upload(db: Session, current_user_id: int) -> Provider | None:
    """
    Same lookup as ``_bnb_provider_for_user``; missing profile → ``None`` so routes can
    return ``JSONResponse`` without union return types (FastAPI response model).
    """
    try:
        return _bnb_provider_for_user(db, current_user_id)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND and _http_detail_is_bnb_profile_not_found(
            exc.detail
        ):
            return None
        raise


def _dashboard_summary_for_provider(
    db: Session,
    provider: Provider,
    referral_override: str | None = None,
) -> BnbDashboardResponse:
    from_provider = normalize_referral_code(getattr(provider, "referral_code", None)) or ""
    if referral_override is not None and str(referral_override).strip() != "":
        canonical = normalize_referral_code(referral_override) or ""
    else:
        canonical = from_provider

    if not canonical:
        ps0 = _provider_optional_str(getattr(provider, "public_slug", None))
        if ps0:
            ps0 = ps0.strip().lower()
        return BnbDashboardResponse(
            referral_code="",
            total_bookings=0,
            total_earnings=0.0,
            public_slug=ps0,
        )

    row = db.execute(_EXACT_AGG_SQL, {"rc": canonical}).mappings().first()
    if row is None:
        row = {"total_bookings": 0, "total_earnings": 0.0}

    total_bookings = int(row["total_bookings"] or 0)
    total_earnings = round(float(row["total_earnings"] or 0.0), 2)

    if total_bookings == 0 and getattr(provider, "id", None) is not None:
        row_fb = db.execute(
            _FALLBACK_BY_BNB_SQL,
            {"pid": int(provider.id)},
        ).mappings().first()
        if row_fb and int(row_fb["total_bookings"] or 0) > 0:
            total_bookings = int(row_fb["total_bookings"] or 0)
            total_earnings = round(float(row_fb["total_earnings"] or 0.0), 2)

    ps = _provider_optional_str(getattr(provider, "public_slug", None))
    if ps:
        ps = ps.strip().lower()
    return BnbDashboardResponse(
        referral_code=canonical,
        total_bookings=total_bookings,
        total_earnings=total_earnings,
        public_slug=ps,
    )


def _payment_earnings_for_provider(db: Session, prov: Provider) -> BnbPaymentEarningsResponse:
    canonical = normalize_referral_code(getattr(prov, "referral_code", None)) or ""
    rows = (
        db.query(Payment)
        .filter(
            Payment.bnb_id == int(prov.id),
            func.lower(Payment.status).in_(("paid", "cash_paid")),
        )
        .all()
    )
    total_bookings = _count_confirmed_bookings_by_bnb_id(db, int(prov.id))

    tg = tb = tp = td = 0.0
    for p in rows:
        tg += float(p.amount or 0)
        plat, bnb_amt, drv = platform_bnb_driver_amounts(p)
        tp += plat
        tb += bnb_amt
        td += drv

    return BnbPaymentEarningsResponse(
        referral_code=canonical,
        payment_count=len(rows),
        total_bookings=total_bookings,
        total_gross=round(tg, 2),
        total_bnb_earnings=round(tb, 2),
        total_platform=round(tp, 2),
        total_driver=round(td, 2),
    )


@router.get("/partner/me", response_model=BnbMeResponse)
def bnb_partner_me(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_bnb),
) -> BnbMeResponse:
    """
    Single partner profile for JWT (Bearer, role ``bnb``): joins ``users.email`` with B&B ``providers``.

    Response includes ``id``, ``email``, ``display_name``, ``logo_url``, ``cover_image_url``
    (from ``providers.cover_url``), ``referral_code``, and ``total_earnings``. No dev bypass.
    """
    uid = int(str(auth.get("sub", "")))
    prov, user_email = _resolve_bnb_provider_row_and_email(db, uid)
    return _bnb_me_response(prov, user_email)


@router.get("/partner/summary", response_model=BnbDashboardResponse)
def bnb_partner_summary(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_bnb),
) -> BnbDashboardResponse:
    """Confirmed bookings aggregate for the authenticated B&B partner."""
    uid = int(str(auth.get("sub", "")))
    prov = _bnb_provider_for_user(db, uid)
    return _dashboard_summary_for_provider(db, prov)


@router.get("/partner/earnings", response_model=BnbPaymentEarningsResponse)
def bnb_partner_earnings(
    db: Session = Depends(get_db),
    auth: dict = Depends(require_bnb),
) -> BnbPaymentEarningsResponse:
    """Card/cash payment splits for the authenticated B&B partner."""
    uid = int(str(auth.get("sub", "")))
    prov = _bnb_provider_for_user(db, uid)
    return _payment_earnings_for_provider(db, prov)


# LEGACY DASHBOARD ENDPOINT - TO BE REMOVED — use ``GET /api/bnb/partner/summary`` (and ``/partner/me``, ``/partner/earnings``).
# @router.get("/dashboard", response_model=BnbDashboardResponse)
# def get_bnb_dashboard(
#     db: Session = Depends(get_db),
#     referral_code: str | None = Query(
#         None,
#         description="Override referral (normalized). If omitted, uses first B&B provider's referral_code.",
#     ),
# ) -> BnbDashboardResponse:
#     print("Incoming referral_code (query param):", referral_code, flush=True)
#
#     provider = db.query(Provider).filter(func.lower(Provider.type) == "bnb").first()
#     if not provider:
#         return BnbDashboardResponse(
#             referral_code="",
#             total_bookings=0,
#             total_earnings=0.0,
#         )
#
#     print("PROVIDER REF:", provider.referral_code, flush=True)
#     out = _dashboard_summary_for_provider(db, provider, referral_override=referral_code)
#     canonical = out.referral_code
#     if canonical:
#         ilike_rows = db.execute(_ILIKE_PROBE_SQL, {"pat": canonical}).mappings().all()
#         print("ILIKE PROBE (similar referral_code + status/price):", [dict(r) for r in ilike_rows], flush=True)
#         print("DB RESULT (exact referral + confirmed):", out.total_bookings, out.total_earnings, flush=True)
#     return out


@router.get("/by-referral/{code}", response_model=BnbByReferralResponse)
def bnb_by_referral(
    code: str,
    db: Session = Depends(get_db),
) -> BnbByReferralResponse:
    """Find B&amp;B ``providers`` row by ``referral_code``; return email-or-business name and ``logo_url``."""
    canonical = normalize_referral_code(code)
    if canonical is None or not is_valid_referral_code_format(canonical):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid referral code")

    row = (
        db.query(Provider, User.email)
        .outerjoin(User, User.id == Provider.user_id)
        .filter(func.lower(Provider.type) == "bnb", func.upper(Provider.referral_code) == canonical)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="B&B not found")
    prov, email = row
    email_str = (str(email).strip() if email else None) or None
    business_name = _provider_optional_str(getattr(prov, "display_name", None)) or _provider_optional_str(
        getattr(prov, "name", None)
    )
    name = email_str or business_name or canonical
    logo_url = _provider_optional_str(getattr(prov, "logo_url", None))
    cover_image_url = _provider_optional_str(getattr(prov, "cover_url", None))
    return BnbByReferralResponse(name=name, logo_url=logo_url, cover_image_url=cover_image_url)


@router.get("/public", response_model=BnbPublicResponse)
def bnb_public_profile(
    code: str = Query(..., description="Referral code, e.g. RIO5HX"),
    db: Session = Depends(get_db),
) -> BnbPublicResponse:
    canonical = normalize_referral_code(code)
    if canonical is None or not is_valid_referral_code_format(canonical):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid referral code")

    row = (
        db.query(Provider, User.email)
        .outerjoin(User, User.id == Provider.user_id)
        .filter(func.lower(Provider.type) == "bnb", func.upper(Provider.referral_code) == canonical)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="B&B not found")
    prov, email = row
    display = _provider_optional_str(getattr(prov, "display_name", None))
    legacy_name = _provider_optional_str(getattr(prov, "name", None))
    display_name = display or legacy_name or ((str(email).strip() if email else None) or canonical)
    logo_url = _provider_optional_str(getattr(prov, "logo_url", None)) or _provider_optional_str(
        getattr(prov, "logo", None)
    )
    cover_image_url = _provider_optional_str(getattr(prov, "cover_url", None))
    city = _provider_optional_str(getattr(prov, "city", None))
    return BnbPublicResponse(
        display_name=display_name,
        logo_url=_absolute_public_asset_url(logo_url),
        cover_image_url=_absolute_public_asset_url(cover_image_url),
        city=city,
    )


@router.get("/public-by-slug/{slug}", response_model=BnbPublicBySlugResponse)
def bnb_public_by_slug(
    slug: str,
    db: Session = Depends(get_db),
) -> BnbPublicBySlugResponse:
    """Public B&B landing: branding + ``referral_code`` for client-side attribution."""
    norm = _parse_public_slug_raw(unquote(slug))
    if norm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="B&B not found")

    row = (
        db.query(Provider, User.email)
        .outerjoin(User, User.id == Provider.user_id)
        .filter(_bnb_type_is_bnb_clause(), func.lower(Provider.public_slug) == norm)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="B&B not found")
    prov, email = row
    rc = normalize_referral_code(getattr(prov, "referral_code", None)) or ""
    if not rc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Partner referral not configured",
        )
    display = _provider_optional_str(getattr(prov, "display_name", None))
    legacy_name = _provider_optional_str(getattr(prov, "name", None))
    display_name = display or legacy_name or ((str(email).strip() if email else None) or rc)
    logo_url = _provider_optional_str(getattr(prov, "logo_url", None)) or _provider_optional_str(
        getattr(prov, "logo", None)
    )
    cover_image_url = _provider_optional_str(getattr(prov, "cover_url", None))
    city = _provider_optional_str(getattr(prov, "city", None))
    return BnbPublicBySlugResponse(
        display_name=display_name,
        logo_url=_absolute_public_asset_url(logo_url),
        cover_image_url=_absolute_public_asset_url(cover_image_url),
        city=city,
        referral_code=rc,
        public_slug=norm,
    )


def _count_confirmed_bookings_by_bnb_id(db: Session, bnb_pk: int) -> int:
    n = (
        db.query(func.count(Booking.id))
        .filter(Booking.bnb_id == int(bnb_pk), func.lower(Booking.status) == "confirmed")
        .scalar()
    )
    return int(n or 0)


def _count_confirmed_bookings_by_referral(db: Session, referral_norm: str) -> int:
    n = (
        db.query(func.count(Booking.id))
        .filter(
            func.upper(func.trim(Booking.referral_code)) == referral_norm,
            func.lower(Booking.status) == "confirmed",
        )
        .scalar()
    )
    return int(n or 0)


@router.get("/me/profile", response_model=BnbMeResponse)
def bnb_me_profile(
    db: Session = Depends(get_db),
    current: dict = Depends(get_bnb_dashboard_identity),
) -> BnbMeResponse:
    """Full B&amp;B profile for dashboard UI (branding, id, earnings)."""
    uid = int(current["id"])
    prov, user_email = _resolve_bnb_provider_row_and_email(db, uid)
    return _bnb_me_response(prov, user_email)


# LEGACY BNB ENDPOINT - TO BE REMOVED — was ``GET /api/bnb/me``; use ``GET /api/bnb/partner/me``.
# @router.get("/me", response_model=BnbMeMinimalResponse)
# def bnb_me(
#     db: Session = Depends(get_db),
#     current: dict = Depends(get_bnb_dashboard_identity),
# ) -> BnbMeMinimalResponse:
#     uid = int(current["id"])
#     prov, user_email = _resolve_bnb_provider_row_and_email(db, uid)
#     return _bnb_me_minimal(prov, user_email)


@router.put("/me", response_model=BnbMeResponse)
def bnb_me_update(
    payload: BnbMeUpdate,
    db: Session = Depends(get_db),
    current: dict = Depends(get_bnb_dashboard_identity),
) -> BnbMeResponse:
    uid = int(current["id"])
    prov, user_email = _resolve_bnb_provider_row_and_email(db, uid)
    updates = payload.model_dump(exclude_unset=True)
    if "display_name" in updates:
        prov.display_name = _provider_optional_str(updates["display_name"])
    if "logo_url" in updates:
        prov.logo_url = _normalize_branding_url_input(updates["logo_url"])
    if "cover_image_url" in updates:
        prov.cover_url = _normalize_branding_url_input(updates["cover_image_url"])
    if "public_slug" in updates:
        v = updates["public_slug"]
        if v is None or (isinstance(v, str) and not str(v).strip()):
            prov.public_slug = None
        else:
            prov.public_slug = _validate_public_slug_for_update(db, prov, v)
    db.add(prov)
    db.commit()
    db.refresh(prov)
    return _bnb_me_response(prov, user_email)


@router.post("/upload-logo", response_model=None)
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: dict = Depends(get_bnb_dashboard_identity),
):
    """
    Upload logo → ``uploads/bnb/bnb_{provider_id}.png``; sets ``providers.logo_url``.
    """
    print("🔥 upload_logo HIT", flush=True)
    uid = int(current["id"])
    prov = _bnb_provider_for_upload(db, uid)
    if prov is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": _BNB_PROFILE_NOT_FOUND},
        )
    rel = save_bnb_logo_png_fixed(file, provider_id=int(prov.id))
    prov.logo_url = rel
    db.add(prov)
    db.commit()
    db.refresh(prov)
    return {"logo_url": rel}


@router.post("/upload-cover", response_model=None)
async def upload_cover(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: dict = Depends(get_bnb_dashboard_identity),
):
    """
    Upload cover → ``uploads/bnb/bnb_{provider_id}_cover.png``; sets ``providers.cover_url``.
    """
    uid = int(current["id"])
    prov = _bnb_provider_for_upload(db, uid)
    if prov is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": _BNB_PROFILE_NOT_FOUND},
        )
    rel = save_bnb_cover_png_fixed(file, provider_id=int(prov.id))
    prov.cover_url = rel
    db.add(prov)
    db.commit()
    db.refresh(prov)
    return {"cover_url": rel}


@router.post("/me/upload-branding", response_model=None)
async def bnb_me_upload_branding(
    kind: Annotated[str, Form(..., description="logo o cover")],
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: dict = Depends(get_bnb_dashboard_identity),
):
    uid = int(current["id"])
    prov = _bnb_provider_for_user(db, uid)
    k = (kind or "").strip().lower()
    if k == "logo":
        max_w = 520
    elif k == "cover":
        max_w = 1600
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="kind deve essere 'logo' o 'cover'.",
        )
    rel = save_bnb_branding_upload(file, provider_id=int(prov.id), max_width=max_w)
    return {"url": rel}


@router.get("/earnings", response_model=BnbPaymentEarningsResponse)
def bnb_earnings_from_payments(
    db: Session = Depends(get_db),
    caller: dict | None = Depends(get_bnb_caller_optional),
    referral_code: str | None = Query(
        None,
        description="B&B referral code (normalized). Use this **or** authenticated ``bnb_id``.",
    ),
    bnb_id: int | None = Query(
        None,
        ge=1,
        description="B&B provider id; must match the logged-in partner (Bearer JWT).",
    ),
) -> BnbPaymentEarningsResponse:
    """
    Card payments (``paid`` / ``cash_paid``): either by ``referral_code`` (public) or by ``bnb_id``
    with a B&B JWT (recommended from the portal).
    """
    if bnb_id is not None:
        if caller is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required when using bnb_id",
            )
        prov = _bnb_provider_for_user(db, int(caller["id"]))
        if int(bnb_id) != int(prov.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="bnb_id does not match your account",
            )
        return _payment_earnings_for_provider(db, prov)
    elif referral_code is not None and str(referral_code).strip() != "":
        canonical = normalize_referral_code(referral_code) or str(referral_code).strip().upper()
        if not canonical:
            raise HTTPException(status_code=400, detail="Invalid referral_code")
        rows = (
            db.query(Payment)
            .filter(
                func.upper(func.trim(Payment.referral_code)) == canonical,
                func.lower(Payment.status).in_(("paid", "cash_paid")),
            )
            .all()
        )
        total_bookings = _count_confirmed_bookings_by_referral(db, canonical)
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide referral_code or bnb_id (with Authorization: Bearer)",
        )

    tg = tb = tp = td = 0.0
    for p in rows:
        tg += float(p.amount or 0)
        plat, bnb, drv = platform_bnb_driver_amounts(p)
        tp += plat
        tb += bnb
        td += drv

    return BnbPaymentEarningsResponse(
        referral_code=canonical,
        payment_count=len(rows),
        total_bookings=total_bookings,
        total_gross=round(tg, 2),
        total_bnb_earnings=round(tb, 2),
        total_platform=round(tp, 2),
        total_driver=round(td, 2),
    )
