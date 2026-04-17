from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class BnbEarning(Base):
    """
    One row per paid card checkout where a B&B referral commission applies (e.g. 10% of gross).
    Complements ``providers.total_earnings`` (running total) for audit / reporting.
    """

    __tablename__ = "bnb_earnings"
    __table_args__ = (UniqueConstraint("payment_id", name="uq_bnb_earnings_payment_id"),)

    id = Column(Integer, primary_key=True, index=True)
    bnb_id = Column(Integer, ForeignKey("providers.id"), nullable=False, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=False, index=True)
    gross_amount_eur = Column(Float, nullable=False)
    commission_eur = Column(Float, nullable=False)
    commission_rate = Column(Float, nullable=False, default=0.10)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    bnb = relationship("Provider", foreign_keys=[bnb_id])
    booking = relationship("Booking", foreign_keys=[booking_id])
    payment = relationship("Payment", foreign_keys=[payment_id])
