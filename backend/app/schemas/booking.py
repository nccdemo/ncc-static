from datetime import date as Date
from datetime import datetime, time as Time

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, field_validator


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

    @computed_field
    @property
    def seats_booked(self) -> int:
        return int(self.people)

    @computed_field
    @property
    def total_price(self) -> float:
        return float(self.price)


class TourInstanceBookingResult(BaseModel):
    success: bool = True
    available: int
