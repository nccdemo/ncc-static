from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    # Optional linkage: vehicles can belong to a driver (driver self-registration).
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    plate = Column(String, nullable=True, unique=True, index=True)
    # Legacy compatibility: some DBs have a plain `type` column.
    type = Column(String, nullable=True)
    vehicle_type = Column(String, nullable=True)
    seats = Column(Integer, nullable=False)
    active = Column(Boolean, nullable=False, default=True)

    bookings = relationship("Booking", back_populates="vehicle")
    availabilities = relationship("Availability", back_populates="vehicle")
    trips = relationship("Trip", back_populates="vehicle")
    driver = relationship("Driver", foreign_keys=[driver_id], back_populates="vehicles")
