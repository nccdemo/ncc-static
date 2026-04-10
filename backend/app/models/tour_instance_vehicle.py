from sqlalchemy import Column, ForeignKey, Integer, PrimaryKeyConstraint

from app.database import Base


class TourInstanceVehicle(Base):
    __tablename__ = "tour_instance_vehicles"

    __table_args__ = (
        PrimaryKeyConstraint("tour_instance_id", "vehicle_id"),
    )

    tour_instance_id = Column(
        Integer,
        ForeignKey("tour_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vehicle_id = Column(
        Integer,
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(Integer, nullable=False, default=1)
