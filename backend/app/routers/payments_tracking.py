from datetime import date as Date
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import bnb_dashboard_dev_bypass_enabled
from app.services.jwt_auth import decode_access_token
from app.models.booking import Booking
from app.models.driver_wallet import DriverWallet, DriverWalletTransaction
from app.models.payment import Payment
from app.models.provider import Provider
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.models.user import User
from app.services.payment_ledger import platform_bnb_driver_amounts

router = APIRouter(prefix="/payments", tags=["payments-tracking"])

_optional_bearer = HTTPBearer(auto_error=False)


def _resolve_me_bnb_provider_id(
    db: Session,
    creds: HTTPAuthorizationCredentials | None,
) -> int:
    """Map ``bnb_id=me`` to ``providers.id`` (JWT role ``bnb`` or dev bypass user id 1)."""
    if bnb_dashboard_dev_bypass_enabled():
        uid = 1
    else:
        if creds is None or creds.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Authentication required for bnb_id=me")
        try:
            payload = decode_access_token(creds.credentials)
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token") from None
        if (payload.get("role") or "").lower() != "bnb":
            raise HTTPException(status_code=403, detail="B&B access required")
        try:
            uid = int(str(payload.get("sub", "")))
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid token")
    prov = (
        db.query(Provider)
        .filter(Provider.user_id == int(uid), func.lower(Provider.type) == "bnb")
        .first()
    )
    if prov is None:
        raise HTTPException(status_code=404, detail="B&B provider profile not found")
    return int(prov.id)


class PaymentOut(BaseModel):
    id: int
    booking_id: int
    customer_name: str | None
    email: str | None
    amount: float
    status: str
    stripe_payment_intent: str | None
    created_at: str

    class Config:
        from_attributes = True


class DailyEarning(BaseModel):
    date: str
    amount: float


class PaymentsSummary(BaseModel):
    total_paid: float
    refunded: float
    cash_paid: float
    net: float
    total_platform: float
    total_bnb: float
    total_driver: float


class PlatformFinancials(BaseModel):
    total_commission_revenue: float
    """Sum of platform-only share (excludes B&amp;B pass-through)."""
    total_bnb_share: float
    """Recorded B&amp;B referral amounts on paid card payments."""
    total_driver_recorded: float
    """Sum of ``driver_amount`` on paid / cash_paid payments (Stripe + internal)."""
    total_driver_payouts: float
    total_cash_commission_owed: float


class ReferralPaymentGroup(BaseModel):
    referral_code: str
    payment_count: int
    total_gross: float
    total_bnb: float
    total_platform: float
    total_driver: float
    bnb_email: str | None = None
    """B&amp;B partner email when ``referral_code`` matches a ``providers`` row (type bnb)."""


class BnbReferralPaymentDetail(BaseModel):
    """Per-payment B&amp;B slice for a given provider (``bnb_id`` query on ``/by-referral``)."""

    customer_name: str
    tour: str
    amount: float
    date: str


@router.get("/", response_model=list[PaymentOut])
def list_payments(
    db: Session = Depends(get_db),
    status: str | None = Query(None, description="Filter by status: pending, paid, refunded"),
    customer: str | None = Query(None, description="Filter by customer name or email (icontains)"),
    from_date: Date | None = Query(None, description="Start date (created_at >= from_date)"),
    to_date: Date | None = Query(None, description="End date (created_at <= to_date)"),
) -> list[PaymentOut]:
    # Explicit joins so we can enrich with Booking + User info.
    q = (
        db.query(Payment, Booking, User)
        .join(Booking, Payment.booking_id == Booking.id)
        .outerjoin(User, Booking.client_id == User.id)
    )

    if status:
        q = q.filter(Payment.status == status.strip().lower())
    if from_date is not None:
        q = q.filter(Payment.created_at >= from_date)
    if to_date is not None:
        q = q.filter(Payment.created_at <= to_date)
    if customer:
        like = f"%{customer.strip()}%"
        q = q.filter(
            (Booking.customer_name.ilike(like))
            | (Booking.email.ilike(like))
            | (User.email.ilike(like))
        )

    q = q.order_by(Payment.created_at.desc())
    rows = q.all()

    out: list[PaymentOut] = []
    for p, b, u in rows:
        # Resolve customer name / email with sensible fallbacks.
        if u is not None:
            cust_email = getattr(u, "email", None) or getattr(b, "email", None) or "N/A"
            cust_name = getattr(b, "customer_name", None) or "Guest"
        else:
            cust_email = getattr(b, "email", None) or "N/A"
            cust_name = getattr(b, "customer_name", None) or "Guest"

        created = p.created_at.isoformat() if p.created_at is not None else ""

        out.append(
            PaymentOut(
                id=p.id,
                booking_id=p.booking_id,
                customer_name=cust_name,
                email=cust_email,
                amount=p.amount,
                status=str(p.status or "").lower(),
                stripe_payment_intent=p.stripe_payment_intent,
                created_at=created,
            )
        )
    return out


@router.get("/detailed", response_model=list[PaymentOut])
def list_payments_detailed(
    db: Session = Depends(get_db),
    status: str | None = Query(None, description="Filter by status: pending, paid, refunded"),
    customer: str | None = Query(None, description="Filter by customer name or email (icontains)"),
    from_date: Date | None = Query(None, description="Start date (created_at >= from_date)"),
    to_date: Date | None = Query(None, description="End date (created_at <= to_date)"),
) -> list[PaymentOut]:
    """
    Alias di /api/payments per uso \"clients-payments-table\".
    """
    return list_payments(
        db=db,
        status=status,
        customer=customer,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/platform-financials", response_model=PlatformFinancials)
def platform_financials(db: Session = Depends(get_db)) -> PlatformFinancials:
    """Platform vs B&amp;B vs driver amounts from ``payments``; wallet payouts and cash owed."""
    payments = (
        db.query(Payment)
        .filter(func.lower(Payment.status).in_(("paid", "cash_paid")))
        .all()
    )
    total_platform = 0.0
    total_bnb = 0.0
    total_driver_rec = 0.0
    for p in payments:
        plat, bnb, drv = platform_bnb_driver_amounts(p)
        total_platform += plat
        total_bnb += bnb
        total_driver_rec += drv

    payout_rows = (
        db.query(DriverWalletTransaction)
        .filter(func.lower(DriverWalletTransaction.type) == "payout")
        .all()
    )
    total_payouts = sum(abs(float(x.amount or 0)) for x in payout_rows)

    owed = float(db.query(func.coalesce(func.sum(DriverWallet.balance), 0.0)).scalar() or 0.0)

    return PlatformFinancials(
        total_commission_revenue=float(total_platform),
        total_bnb_share=float(total_bnb),
        total_driver_recorded=float(total_driver_rec),
        total_driver_payouts=float(total_payouts),
        total_cash_commission_owed=float(owed),
    )


@router.get("/summary", response_model=PaymentsSummary)
def payments_summary(
    from_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
) -> PaymentsSummary:
    q = db.query(Payment)
    # Do not 422 on invalid/missing filters: parse best-effort and ignore if invalid.
    if from_date:
        try:
            q = q.filter(Payment.created_at >= Date.fromisoformat(str(from_date)))
        except Exception:
            pass
    if to_date:
        try:
            q = q.filter(Payment.created_at <= Date.fromisoformat(str(to_date)))
        except Exception:
            pass

    payments = q.all()

    total_paid = sum(p.amount for p in payments if str(p.status or "").lower() == "paid")
    total_refunded = sum(p.amount for p in payments if str(p.status or "").lower() == "refunded")
    total_cash = sum(p.amount for p in payments if str(p.status or "").lower() == "cash_paid")
    net = float(total_paid) - float(total_refunded)

    paid_like = [p for p in payments if str(p.status or "").lower() in ("paid", "cash_paid")]
    tp = tb = td = 0.0
    for p in paid_like:
        plat, bnb, drv = platform_bnb_driver_amounts(p)
        tp += plat
        tb += bnb
        td += drv

    return PaymentsSummary(
        total_paid=float(total_paid),
        refunded=float(total_refunded),
        cash_paid=float(total_cash),
        net=float(net),
        total_platform=float(tp),
        total_bnb=float(tb),
        total_driver=float(td),
    )


def _payments_by_referral_aggregate(
    db: Session,
    status_filter: str | None,
) -> list[ReferralPaymentGroup]:
    q = db.query(Payment).filter(Payment.referral_code.isnot(None), Payment.referral_code != "")
    if status_filter:
        q = q.filter(func.lower(Payment.status) == str(status_filter).strip().lower())
    else:
        q = q.filter(func.lower(Payment.status).in_(("paid", "cash_paid")))
    rows = q.all()
    buckets: dict[str, list[Payment]] = {}
    for p in rows:
        rc = str(p.referral_code or "").strip().upper()
        if not rc:
            continue
        buckets.setdefault(rc, []).append(p)
    out: list[ReferralPaymentGroup] = []
    for rc in sorted(buckets.keys()):
        plist = buckets[rc]
        tg = tb = tp = td = 0.0
        for p in plist:
            tg += float(p.amount or 0)
            plat, bnb, drv = platform_bnb_driver_amounts(p)
            tp += plat
            tb += bnb
            td += drv
        bnb_email: str | None = None
        prov_row = (
            db.query(User.email)
            .select_from(Provider)
            .join(User, User.id == Provider.user_id)
            .filter(
                func.lower(Provider.type) == "bnb",
                func.upper(Provider.referral_code) == rc,
            )
            .first()
        )
        if prov_row and prov_row[0]:
            bnb_email = str(prov_row[0]).strip() or None
        out.append(
            ReferralPaymentGroup(
                referral_code=rc,
                payment_count=len(plist),
                total_gross=round(tg, 2),
                total_bnb=round(tb, 2),
                total_platform=round(tp, 2),
                total_driver=round(td, 2),
                bnb_email=bnb_email,
            )
        )
    return out


def _payments_by_bnb_id_detail(
    db: Session,
    bnb_id: int,
    status_filter: str | None,
) -> list[BnbReferralPaymentDetail]:
    prov = (
        db.query(Provider)
        .filter(Provider.id == int(bnb_id), func.lower(Provider.type) == "bnb")
        .first()
    )
    if prov is None:
        raise HTTPException(status_code=404, detail="B&B provider not found")

    ref = str(prov.referral_code or "").strip().upper()
    link_clauses = [
        Payment.bnb_id == int(bnb_id),
        Booking.bnb_id == int(bnb_id),
    ]
    if ref:
        link_clauses.append(func.upper(func.coalesce(Payment.referral_code, "")) == ref)
        link_clauses.append(func.upper(func.coalesce(Booking.referral_code, "")) == ref)

    q = (
        db.query(Payment)
        .join(Booking, Payment.booking_id == Booking.id)
        .filter(or_(*link_clauses))
    )
    if status_filter:
        q = q.filter(func.lower(Payment.status) == str(status_filter).strip().lower())
    else:
        q = q.filter(func.lower(Payment.status).in_(("paid", "cash_paid")))

    payments = (
        q.options(
            joinedload(Payment.booking)
            .joinedload(Booking.tour_instance)
            .joinedload(TourInstance.tour),
        )
        .order_by(Payment.created_at.desc())
        .all()
    )

    need_tour_ids: set[int] = set()
    for p in payments:
        b = p.booking
        if (
            b is not None
            and b.tour_id is not None
            and not (b.tour_instance is not None and b.tour_instance.tour is not None)
        ):
            need_tour_ids.add(int(b.tour_id))

    tour_titles: dict[int, str] = {}
    if need_tour_ids:
        for t in db.query(Tour).filter(Tour.id.in_(need_tour_ids)):
            tour_titles[int(t.id)] = str(t.title or "").strip() or "—"

    out: list[BnbReferralPaymentDetail] = []
    for p in payments:
        b = p.booking
        customer = "—"
        tour_name = "—"
        date_str = ""
        if b is not None:
            customer = str(b.customer_name or "").strip() or "—"
            if b.tour_instance is not None and b.tour_instance.tour is not None:
                tour_name = str(b.tour_instance.tour.title or "").strip() or "—"
            elif b.tour_id is not None:
                tour_name = tour_titles.get(int(b.tour_id), "—")
            if b.date is not None:
                date_str = b.date.isoformat()
        if not date_str and p.created_at is not None:
            date_str = p.created_at.date().isoformat()

        _plat, bnb_amt, _drv = platform_bnb_driver_amounts(p)
        out.append(
            BnbReferralPaymentDetail(
                customer_name=customer,
                tour=tour_name,
                amount=round(float(bnb_amt), 2),
                date=date_str,
            )
        )
    out.sort(key=lambda r: r.date or "", reverse=True)
    return out


@router.get("/by-referral")
def payments_by_referral(
    db: Session = Depends(get_db),
    status_filter: str | None = Query(None, description="paid, cash_paid, or omit for both"),
    bnb_id: str | None = Query(
        None,
        description="Provider id (int), or ``me`` with B&amp;B JWT (or dev bypass).",
    ),
    creds: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
):
    """Aggregate by referral, or (with ``bnb_id``) line items for one B&amp;B provider."""
    if bnb_id is not None and str(bnb_id).strip() != "":
        key = str(bnb_id).strip()
        if key.lower() == "me":
            pid = _resolve_me_bnb_provider_id(db, creds)
            return _payments_by_bnb_id_detail(db, pid, status_filter)
        try:
            pid = int(key)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail="bnb_id must be a positive integer or the literal 'me'",
            )
        if pid < 1:
            raise HTTPException(status_code=422, detail="Invalid bnb_id")
        return _payments_by_bnb_id_detail(db, pid, status_filter)
    return _payments_by_referral_aggregate(db, status_filter)


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, db: Session = Depends(get_db)) -> PaymentOut:
    p: Payment | None = (
        db.query(Payment)
        .options(joinedload(Payment.booking))
        .filter(Payment.id == payment_id)
        .first()
    )
    if p is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    b = p.booking
    return PaymentOut(
        id=p.id,
        booking_id=p.booking_id,
        customer_name=getattr(b, "customer_name", None) if b is not None else None,
        email=getattr(b, "email", None) if b is not None else None,
        amount=p.amount,
        status=str(p.status or "").lower(),
        stripe_payment_intent=p.stripe_payment_intent,
        created_at=p.created_at.isoformat() if p.created_at is not None else "",
    )


