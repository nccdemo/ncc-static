from sqlalchemy import Column, Date, Integer, String, Time, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class DriverSchedule(Base):
    __tablename__ = "driver_schedules"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True, index=True)
    tour_instance_id = Column(Integer, ForeignKey("tour_instances.id"), nullable=True, index=True)
    date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    status = Column(String, nullable=False, default="assigned")  # assigned | completed

    driver = relationship("Driver", backref="schedules")
    trip = relationship("Trip", foreign_keys=[trip_id])
    tour_instance = relationship(
        "TourInstance",
        back_populates="driver_schedules",
        foreign_keys=[tour_instance_id],
    )

