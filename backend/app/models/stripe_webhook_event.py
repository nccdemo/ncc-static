from sqlalchemy import Column, DateTime, String, func

from app.database import Base


class StripeWebhookEvent(Base):
    """Processed Stripe webhook event ids (idempotency / retry safety)."""

    __tablename__ = "stripe_webhook_events"

    event_id = Column(String(255), primary_key=True)
    processed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
