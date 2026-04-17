from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship, synonym
from sqlalchemy.types import JSON

from app.database import Base


class Tour(Base):
    """
    Tour template (1:N with ``TourInstance``).

    Spec field mapping: ``driver_id`` → DB ``owner_driver_id``; ``base_price`` → DB ``price``.
    """

    __tablename__ = "tours"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    owner_driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    duration = Column(Integer, nullable=True)
    capacity = Column(Integer, nullable=False, default=7)
    occupied_seats = Column(Integer, nullable=False, default=0)
    # JSON array of relative URL strings, e.g. ``["/uploads/tours/abc.jpg"]`` (max 5 enforced on upload).
    images = Column(JSON, nullable=False, default=lambda: [])
    type = Column(String, nullable=False, default="tour")
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=True, server_default=func.now())

    driver_id = synonym("owner_driver_id")
    base_price = synonym("price")

    instances = relationship("TourInstance", back_populates="tour")
