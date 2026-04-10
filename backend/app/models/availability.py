from sqlalchemy import Column, Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Availability(Base):
    __tablename__ = "availabilities"
    __table_args__ = (UniqueConstraint("vehicle_id", "date", name="uq_vehicle_date"),)

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    total_slots = Column(Integer, nullable=False)
    booked_slots = Column(Integer, nullable=False, default=0)

    vehicle = relationship("Vehicle", back_populates="availabilities")
