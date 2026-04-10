from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.database import Base


class DriverWallet(Base):
    __tablename__ = "driver_wallets"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, unique=True, index=True)
    balance = Column(Float, nullable=False, default=0.0)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    driver = relationship("Driver", backref="wallet")
    transactions = relationship(
        "DriverWalletTransaction",
        back_populates="wallet",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DriverWalletTransaction(Base):
    __tablename__ = "driver_wallet_transactions"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, index=True)
    ride_id = Column(Integer, nullable=True, index=True)
    amount = Column(Float, nullable=False)
    type = Column(String, nullable=False)  # cash_in | settlement | payout | adjustment
    note = Column(String, nullable=True)  # human-readable, e.g. "Cash ride #123"
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    wallet_id = Column(Integer, ForeignKey("driver_wallets.id", ondelete="CASCADE"), nullable=True, index=True)
    wallet = relationship("DriverWallet", back_populates="transactions")

