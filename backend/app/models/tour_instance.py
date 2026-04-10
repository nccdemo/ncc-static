from sqlalchemy import JSON, Column, Date, DateTime, Float, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import relationship, synonym

from app.database import Base


class TourInstance(Base):
    """
    Scheduled occurrence of a tour (1:N with ``Booking``).

    Spec field ``time`` maps to DB column ``start_time``.
    ``price`` is an optional per-instance override; when null, APIs typically use ``Tour.price``.
    """

    __tablename__ = "tour_instances"

    id = Column(Integer, primary_key=True, index=True)
    tour_id = Column(Integer, ForeignKey("tours.id"), nullable=False, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True, index=True)
    assigned_driver_ids = Column(JSON, nullable=True)
    date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=True)
    time = synonym("start_time")
    # Optional cap on remaining seats (null = derive from vehicles × qty minus bookings in API).
    available_seats = Column(Integer, nullable=True)
    price = Column(Float, nullable=True)
    vehicles = Column(Integer, nullable=False, default=1)
    vehicle_ids = Column(JSON, nullable=False, default=list)
    capacity = Column(Integer, nullable=False, default=7)
    driver_name = Column(String, nullable=True)
    vehicle_name = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")
    created_at = Column(DateTime, nullable=True, server_default=func.now())

    tour = relationship("Tour", back_populates="instances", foreign_keys=[tour_id])
    bookings = relationship(
        "Booking",
        back_populates="tour_instance",
        foreign_keys="Booking.tour_instance_id",
    )
    trips = relationship("Trip", back_populates="tour_instance")
    driver = relationship("Driver", foreign_keys=[driver_id])
    driver_schedules = relationship(
        "DriverSchedule",
        back_populates="tour_instance",
        foreign_keys="DriverSchedule.tour_instance_id",
    )

