from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    ride_id = Column(Integer, nullable=True, index=True)
    amount = Column(Float, nullable=False)  # gross / total charged (customer)
    commission_amount = Column(Float, nullable=True)  # legacy: platform+bnb fees; prefer platform_amount + bnb_amount
    driver_amount = Column(Float, nullable=True)
    platform_amount = Column(Float, nullable=True)  # platform share only (EUR)
    bnb_amount = Column(Float, nullable=True)  # B&B referral share (EUR)
    referral_code = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, default="paid")  # paid, refunded, cash_paid
    stripe_payment_intent = Column(String, nullable=True, index=True)
    stripe_session_id = Column(String, nullable=True, unique=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True, index=True)
    bnb_id = Column(Integer, ForeignKey("providers.id"), nullable=True, index=True)
    stripe_refund_id = Column(String, nullable=True, index=True)
    stripe_driver_transfer_id = Column(String, nullable=True, index=True)
    stripe_bnb_transfer_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    booking = relationship("Booking", backref="payments")

