from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Time, func
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship, synonym

from app.database import Base


class Booking(Base):
    """
    Tour / transfer booking row.

    Spec mapping: ``customer_email`` → ``email``, ``customer_phone`` → ``phone``,
    ``total_amount`` → ``price``, ``seats`` → hybrid on ``people``.
    ``status`` is a string (e.g. pending, confirmed, cancelled; other values exist for payments).
    """

    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    stripe_session_id = Column(String, nullable=True, unique=True, index=True)
    payment_intent_id = Column(String, nullable=True, index=True)
    tour_id = Column(Integer, ForeignKey("tours.id"), nullable=True)
    tour_instance_id = Column(Integer, ForeignKey("tour_instances.id"), nullable=True, index=True)
    customer_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)
    people = Column(Integer, nullable=False, default=1)
    flight_number = Column(String, nullable=True)
    pickup_latitude = Column(Float, nullable=True)
    pickup_longitude = Column(Float, nullable=True)
    dropoff_latitude = Column(Float, nullable=True)
    dropoff_longitude = Column(Float, nullable=True)
    pickup = Column(String, nullable=True)
    destination = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    # Optional: driver-side base before 1.25 customer markup; if null, base = price / 1.25.
    base_price = Column(Float, nullable=True)
    has_bnb = Column(Boolean, nullable=False, default=False)
    status = Column(String, nullable=False, default="pending")
    payment_status = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, nullable=True, server_default=func.now())
    checked_in = Column(Boolean, nullable=False, default=False)
    start_time = Column(DateTime, nullable=True)
    pickup_datetime = Column(DateTime, nullable=True)
    qr_code = Column(String, nullable=True, unique=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    bnb_id = Column(Integer, ForeignKey("providers.id"), nullable=True, index=True)
    referral_code = Column(String, nullable=True, index=True)

    customer_email = synonym("email")
    customer_phone = synonym("phone")
    total_amount = synonym("price")

    @hybrid_property
    def seats(self) -> int:
        """Seat count (DB column ``people``)."""
        return int(self.people or 0)

    @seats.setter
    def seats(self, value: int) -> None:
        self.people = int(value)

    @seats.expression
    def seats(cls):  # noqa: N805
        return cls.people

    tour_instance = relationship(
        "TourInstance",
        back_populates="bookings",
        foreign_keys=[tour_instance_id],
    )
    trip = relationship(
        "Trip",
        back_populates="bookings",
        foreign_keys=[trip_id],
    )
    vehicle = relationship("Vehicle", back_populates="bookings")
