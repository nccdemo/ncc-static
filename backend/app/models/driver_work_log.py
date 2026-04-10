from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import relationship

from app.database import Base


class DriverWorkLog(Base):
    __tablename__ = "driver_work_logs"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    rides_count = Column(Integer, nullable=False, default=0)
    total_amount = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    driver = relationship("Driver", backref="work_logs")

