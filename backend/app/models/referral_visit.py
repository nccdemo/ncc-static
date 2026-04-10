from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class ReferralVisit(Base):
    """Landing-page hit with an active referral code (for visits vs bookings conversion)."""

    __tablename__ = "referral_visits"

    id = Column(Integer, primary_key=True, index=True)
    referral_code = Column(String(32), nullable=False, index=True)
    visited_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
