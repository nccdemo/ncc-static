from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.database import Base


class BnbCommissionTransfer(Base):
    """
    Records a Stripe Transfer of referral commission to a B&B (Connect account).
    One row per PaymentIntent — idempotent with Stripe idempotency key bnb_commission_<pi_id>.
    """

    __tablename__ = "bnb_commission_transfers"

    id = Column(Integer, primary_key=True, index=True)
    stripe_payment_intent_id = Column(String(255), unique=True, nullable=False, index=True)
    stripe_transfer_id = Column(String(255), nullable=False)
    booking_id = Column(Integer, nullable=True, index=True)
    bnb_provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
