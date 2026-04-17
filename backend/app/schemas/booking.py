from datetime import date as Date
from datetime import datetime, time as Time
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator


class BookingBase(BaseModel):
    tour_id: int | None = None
    customer_name: str
    email: str
    phone: str
    date: Date
    time: Time
    people: int
    flight_number: str | None = None
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    dropoff_latitude: float | None = None
    dropoff_longitude: float | None = None
    pickup: str | None = None
    destination: str | None = None
    price: float
    status: str = "pending"
    qr_code: str | None = None
    driver_id: int | None = None
    vehicle_id: int | None = None
    pickup_datetime: datetime | None = None


class BookingCreate(BaseModel):
    """Tour-instance booking: `tour_instance_id` and seat count (`seats` or `seats_booked`) are required."""

    model_config = ConfigDict(populate_by_name=True)

    tour_instance_id: int
    seats: int = Field(..., validation_alias=AliasChoices("seats", "seats_booked"))
    client_id: int | None = None
    customer_name: str | None = None
    email: str | None = None
    phone: str | None = None
    date: Date | None = None
    time: Time | None = None
    tour_id: int | None = None
    people: int | None = None
    flight_number: str | None = None
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    dropoff_latitude: float | None = None
    dropoff_longitude: float | None = None
    pickup: str | None = None
    destination: str | None = None
    price: float | None = None
    status: str | None = None
    qr_code: str | None = None
    driver_id: int | None = None
    vehicle_id: int | None = None
    referral_code: str | None = None

    @field_validator("referral_code", mode="before")
    @classmethod
    def _normalize_referral_code(cls, v: object) -> str | None:
        if v is None:
            return None
        s = str(v).strip().upper()
        return s or None


def booking_orm_to_response_dict(b: Any) -> dict[str, Any]:
    """
    Build a plain dict for :class:`BookingResponse` from a SQLAlchemy ``Booking`` row.

    Coerces legacy NULLs and reads nested ``trip`` / ``driver`` without assuming they exist.
    """
    trip = getattr(b, "trip", None)
    trip_driver_name: str | None = None
    if trip is not None:
        drv = getattr(trip, "driver", None)
        if drv is not None:
            n = getattr(drv, "name", None)
            trip_driver_name = str(n).strip() if n is not None and str(n).strip() else None

    fallback_date = Date(1900, 1, 1)
    fallback_time = Time(0, 0)
    raw_date = getattr(b, "date", None)
    raw_time = getattr(b, "time", None)
    people = getattr(b, "people", None)
    price = getattr(b, "price", None)

    return {
        "id": int(getattr(b, "id")),
        "tour_id": getattr(b, "tour_id", None),
        "customer_name": (getattr(b, "customer_name", None) or "") or "—",
        "email": (getattr(b, "email", None) or "") or "—",
        "phone": (getattr(b, "phone", None) or "") or "—",
        "date": raw_date if raw_date is not None else fallback_date,
        "time": raw_time if raw_time is not None else fallback_time,
        "people": int(people) if people is not None else 1,
        "flight_number": getattr(b, "flight_number", None),
        "pickup_latitude": getattr(b, "pickup_latitude", None),
        "pickup_longitude": getattr(b, "pickup_longitude", None),
        "dropoff_latitude": getattr(b, "dropoff_latitude", None),
        "dropoff_longitude": getattr(b, "dropoff_longitude", None),
        "pickup": getattr(b, "pickup", None),
        "destination": getattr(b, "destination", None),
        "price": float(price) if price is not None else 0.0,
        "status": getattr(b, "status", None) or "pending",
        "qr_code": getattr(b, "qr_code", None),
        "driver_id": getattr(b, "driver_id", None),
        "vehicle_id": getattr(b, "vehicle_id", None),
        "pickup_datetime": getattr(b, "pickup_datetime", None),
        "tour_instance_id": getattr(b, "tour_instance_id", None),
        "client_id": getattr(b, "client_id", None),
        "created_at": getattr(b, "created_at", None),
        "start_time": getattr(b, "start_time", None),
        "qr_image_path": getattr(b, "qr_image_path", None),
        "referral_code": getattr(b, "referral_code", None),
        "bnb_id": getattr(b, "bnb_id", None),
        "trip_driver_name": trip_driver_name,
    }


class BookingResponse(BookingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tour_instance_id: int | None = None
    client_id: int | None = None
    created_at: datetime | None = None
    start_time: datetime | None = None
    qr_image_path: str | None = None
    referral_code: str | None = None
    bnb_id: int | None = None
    trip_driver_name: str | None = Field(
        default=None,
        description="Driver name from linked trip when ``trip`` and ``trip.driver`` are loaded.",
    )

    @model_validator(mode="before")
    @classmethod
    def _coerce_sqlalchemy_booking(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        if getattr(data, "_sa_instance_state", None) is None:
            return data
        return booking_orm_to_response_dict(data)

    @computed_field
    @property
    def seats_booked(self) -> int:
        return int(self.people or 0)

    @computed_field
    @property
    def total_price(self) -> float:
        return float(self.price if self.price is not None else 0.0)


class TourInstanceBookingResult(BaseModel):
    success: bool = True
    available: int
