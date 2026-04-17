from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    signup_status = Column(String, nullable=False, default="legacy")
    # DB column remains "active" for existing databases; ORM name matches API (is_active).
    is_active = Column("active", Boolean, nullable=False, default=True)
    status = Column(String, nullable=False, default="available")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    last_location_update = Column(DateTime, nullable=True)
    # Optional context for the last GPS sample (active / recent trip).
    last_location_trip_id = Column(Integer, ForeignKey("trips.id", ondelete="SET NULL"), nullable=True, index=True)

    # Default vehicle for this driver (trips copy this when the driver is assigned).
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True, index=True)

    # Self-registration: vehicle & documents (nullable; admin-created drivers may omit).
    vehicle_plate_number = Column(String, nullable=True)
    vehicle_type = Column(String, nullable=True)
    vehicle_seats = Column(Integer, nullable=True)
    driver_license_number = Column(String, nullable=True)
    ncc_license_number = Column(String, nullable=True)
    insurance_number = Column(String, nullable=True)
    # Stripe Connect Express/Standard account id (acct_…) for destination charges.
    stripe_account_id = Column(String, nullable=True, index=True)

    # Primary fleet vehicle linked to this driver (also: vehicle_plate_number → vehicles.plate resolve).
    vehicle = relationship("Vehicle", foreign_keys=[vehicle_id])
    # Vehicles created during driver self-registration (one-to-many; primary is `vehicle_id` above).
    vehicles = relationship("Vehicle", foreign_keys="Vehicle.driver_id", back_populates="driver")
    trips = relationship(
        "Trip",
        back_populates="driver",
        foreign_keys="Trip.driver_id",
    )
