from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class ServiceLog(Base):
    __tablename__ = "service_logs"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    pdf_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
