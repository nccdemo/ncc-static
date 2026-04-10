from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import relationship

from app.database import Base


class Quote(Base):
    """Custom NCC ride offer before payment. After pay → Booking + Trip."""

    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    status = Column(String, nullable=False, default="pending")
    customer_name = Column(String, nullable=False, default="Cliente")
    email = Column(String, nullable=False)
    phone = Column(String, nullable=False, default="N/A")
    pickup = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)
    people = Column(Integer, nullable=False, default=1)
    price = Column(Float, nullable=False)
    distance_km = Column(Float, nullable=True)
    flight_number = Column(String, nullable=True)
    stripe_session_id = Column(String, nullable=True, unique=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=True, server_default=func.now())

    booking = relationship("Booking", foreign_keys=[booking_id])
