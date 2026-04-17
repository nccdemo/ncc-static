from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, Column, Date, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, text
from sqlalchemy.orm import foreign, relationship

from app.database import Base


class TripStatus(str, Enum):
    """
    Workflow states (Postgres enum ``trip_status``).

    Marketplace "available" pool: :attr:`SCHEDULED`, :attr:`PENDING` (no driver, claimable).
    Terminal / cleanup: :attr:`COMPLETED`, :attr:`CANCELLED`, :attr:`EXPIRED`.
    """

    SCHEDULED = "SCHEDULED"
    PENDING = "PENDING"
    ASSIGNED = "ASSIGNED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EN_ROUTE = "EN_ROUTE"
    ARRIVED = "ARRIVED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    tour_instance_id = Column(
        Integer, ForeignKey("tour_instances.id"), nullable=True, index=True
    )
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True, index=True)
    assigned_driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True, index=True)
    service_date = Column(Date, nullable=True, index=True)
    pickup = Column(String, nullable=True)
    destination = Column(String, nullable=True)
    pickup_lat = Column(Float, nullable=True)
    pickup_lng = Column(Float, nullable=True)
    destination_lat = Column(Float, nullable=True)
    destination_lng = Column(Float, nullable=True)
    # Backward/compat alias columns for "dropoff" naming (driver apps / older code).
    dropoff_lat = Column(Float, nullable=True)
    dropoff_lng = Column(Float, nullable=True)
    tracking_token = Column(String, nullable=True, unique=True, index=True)
    eta = Column(DateTime, nullable=True)
    status = Column(
        SAEnum(TripStatus, name="trip_status"),
        nullable=False,
        default=TripStatus.SCHEDULED,
        index=True,
    )
    assigned_at = Column(DateTime, nullable=True)
    assignment_attempts = Column(Integer, nullable=False, default=0)
    last_assigned_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True, index=True)
    # When the ride is expected to start (UTC naive, same convention as ``eta`` / ``datetime.utcnow``).
    scheduled_at = Column(DateTime, nullable=True, index=True)
    start_km = Column(Float, nullable=True)
    end_km = Column(Float, nullable=True)
    service_start_time = Column(DateTime, nullable=True)
    service_end_time = Column(DateTime, nullable=True)
    passengers = Column(Integer, nullable=False, default=1)
    notes = Column(String, nullable=True)
    # Ride fare (usually mirrors primary booking.price); nullable for legacy rows.
    price = Column(Float, nullable=True)
    # Commission model (base = driver share before markup; final = base × 1.25).
    base_price = Column(Float, nullable=True)
    final_price = Column(Float, nullable=True)
    bnb_commission = Column(Float, nullable=True)
    platform_commission = Column(Float, nullable=True)
    driver_amount = Column(Float, nullable=True)
    has_bnb = Column(Boolean, nullable=False, default=False)
    # Platform commission fraction for this trip (legacy / derived: (bnb+platform) / final).
    commission_rate = Column(Float, nullable=False, default=0.2, server_default=text("0.2"))
    # Card payout lifecycle: none -> pending (in a batch) -> paid (settled to driver).
    payout_status = Column(String, nullable=False, default="none", server_default=text("'none'"))
    driver_payout_id = Column(Integer, ForeignKey("driver_payouts.id", ondelete="SET NULL"), nullable=True, index=True)

    tour_instance = relationship("TourInstance", back_populates="trips")
    driver = relationship(
        "Driver",
        back_populates="trips",
        foreign_keys=[driver_id],
        overlaps="assigned_driver",
    )
    assigned_driver = relationship(
        "Driver",
        foreign_keys=[assigned_driver_id],
        overlaps="driver,trips",
    )
    vehicle = relationship("Vehicle", back_populates="trips")
    bookings = relationship(
        "Booking",
        back_populates="trip",
        foreign_keys="Booking.trip_id",
    )
    # Primary/first booking convenience relationship (read-only).
    # This enables joinedload(Trip.booking) in dispatch queries.
    booking = relationship(
        "Booking",
        primaryjoin="Trip.id==foreign(Booking.trip_id)",
        order_by="Booking.id",
        uselist=False,
        viewonly=True,
    )

    @property
    def booking_id(self) -> int | None:
        b = self.booking
        return b.id if b is not None else None
