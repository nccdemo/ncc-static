"""Admin-only aggregates for the dedicated admin dashboard (JWT role ``admin``)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.crud.booking import get_bookings
from app.database import get_db
from app.deps.auth import require_admin
from app.models.bnb_commission_transfer import BnbCommissionTransfer
from app.models.booking import Booking
from app.models.driver import Driver
from app.models.driver_payout import DriverInvoice, DriverPayout
from app.models.driver_schedule import DriverSchedule
from app.models.driver_wallet import DriverWallet, DriverWalletTransaction
from app.models.driver_work_log import DriverWorkLog
from app.models.payment import Payment
from app.models.provider import Provider
from app.models.stripe_webhook_event import StripeWebhookEvent
from app.models.user import User
from app.models.tour import Tour
from app.models.tour_instance import TourInstance
from app.models.tour_instance_vehicle import TourInstanceVehicle
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.routers.bnb_dashboard import (
    _dashboard_summary_for_provider,
    _payment_earnings_for_provider,
)
from app.schemas.booking import BookingResponse

router = APIRouter(prefix="/admin", tags=["admin-dashboard"])


@router.get("/bookings", response_model=list[BookingResponse])
def admin_list_bookings(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[BookingResponse]:
    return get_bookings(db)


class AdminBnbListRow(BaseModel):
    """Flat list for admin tables: one row per B&amp;B provider."""

    provider_id: int = Field(..., description="``providers.id`` (B&amp;B row).")
    email: str | None = None
    referral_code: str | None = None
    earnings: float = Field(
        0.0,
        description="Accumulated B&amp;B commission stored on ``providers.total_earnings``.",
    )


@router.get("/bnb", response_model=list[AdminBnbListRow])
def admin_bnb_list(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[AdminBnbListRow]:
    rows = (
        db.query(Provider, User.email)
        .outerjoin(User, User.id == Provider.user_id)
        .filter(func.lower(Provider.type) == "bnb")
        .order_by(Provider.id.asc())
        .all()
    )
    out: list[AdminBnbListRow] = []
    for prov, user_email in rows:
        out.append(
            AdminBnbListRow(
                provider_id=int(prov.id),
                email=(str(user_email).strip() if user_email else None) or None,
                referral_code=str(prov.referral_code).strip() if prov.referral_code else None,
                earnings=float(prov.total_earnings or 0.0),
            )
        )
    return out


class AdminBnbPerformanceRow(BaseModel):
    provider_id: int
    user_id: int | None = None
    referral_code: str
    total_bookings: int = Field(
        ...,
        description="Confirmed bookings (referral or bnb_id), same logic as B&B dashboard summary.",
    )
    total_earnings: float = Field(
        ...,
        description="Sum of booking prices (confirmed) for that B&B.",
    )
    payment_count: int = 0
    total_bnb_earnings_from_payments: float = 0.0


@router.get("/bnb/performance", response_model=list[AdminBnbPerformanceRow])
def admin_bnb_performance(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> list[AdminBnbPerformanceRow]:
    providers = (
        db.query(Provider)
        .filter(func.lower(Provider.type) == "bnb")
        .order_by(Provider.id.asc())
        .all()
    )
    out: list[AdminBnbPerformanceRow] = []
    for p in providers:
        summ = _dashboard_summary_for_provider(db, p)
        pay = _payment_earnings_for_provider(db, p)
        out.append(
            AdminBnbPerformanceRow(
                provider_id=int(p.id),
                user_id=int(p.user_id) if p.user_id is not None else None,
                referral_code=summ.referral_code,
                total_bookings=summ.total_bookings,
                total_earnings=summ.total_earnings,
                payment_count=pay.payment_count,
                total_bnb_earnings_from_payments=pay.total_bnb_earnings,
            )
        )
    return out


@router.post("/reset-platform")
def admin_reset_platform(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    """
    Admin-only destructive reset for demo/dev environments.

    Deletes platform operational data but **does not** delete the ``users`` table (keeps admins).
    """
    # Single transaction so partial deletes don't leave FK-inconsistent state.
    with db.begin():
        # --- Dependent / ledger tables (reference bookings/drivers/providers) ---
        db.query(BnbCommissionTransfer).delete(synchronize_session=False)
        db.query(StripeWebhookEvent).delete(synchronize_session=False)
        db.query(Payment).delete(synchronize_session=False)

        # --- Required delete order (core entities) ---
        # 1) Booking
        db.query(Booking).delete(synchronize_session=False)

        # 2) Trip (plus associated scheduling rows)
        db.query(DriverSchedule).delete(synchronize_session=False)
        db.query(Trip).delete(synchronize_session=False)

        # 3) TourInstance
        db.query(TourInstanceVehicle).delete(synchronize_session=False)
        db.query(TourInstance).delete(synchronize_session=False)

        # 4) Tour
        db.query(Tour).delete(synchronize_session=False)

        # 5) Vehicle
        db.query(Vehicle).delete(synchronize_session=False)

        # 6) Driver (plus driver accounting tables)
        db.query(DriverWalletTransaction).delete(synchronize_session=False)
        db.query(DriverWallet).delete(synchronize_session=False)
        db.query(DriverInvoice).delete(synchronize_session=False)
        db.query(DriverPayout).delete(synchronize_session=False)
        db.query(DriverWorkLog).delete(synchronize_session=False)
        db.query(Driver).delete(synchronize_session=False)

        # 7) BNB / Provider
        db.query(Provider).update({Provider.total_earnings: 0.0}, synchronize_session=False)
        db.query(Provider).delete(synchronize_session=False)

    return {"status": "platform reset complete"}
