from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.database import Base


class DriverPayout(Base):
    """Batch of card-ride earnings owed to a driver (not wallet/cash)."""

    __tablename__ = "driver_payouts"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    rides_count = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="pending")  # pending | paid
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    paid_at = Column(DateTime, nullable=True)

    driver = relationship("Driver", backref="payouts")
    invoices = relationship("DriverInvoice", back_populates="payout")


class DriverInvoice(Base):
    __tablename__ = "driver_invoices"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True)
    payout_id = Column(Integer, ForeignKey("driver_payouts.id", ondelete="SET NULL"), nullable=True, index=True)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False, server_default=func.current_date())
    invoice_number = Column(String, nullable=False, unique=True, index=True)

    driver = relationship("Driver", backref="invoices")
    payout = relationship("DriverPayout", back_populates="invoices")
