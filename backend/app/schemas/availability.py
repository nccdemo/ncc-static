from datetime import date

from pydantic import BaseModel, ConfigDict


class AvailabilityBase(BaseModel):
    date: date
    vehicle_id: int
    total_slots: int
    booked_slots: int = 0


class AvailabilityCreate(AvailabilityBase):
    pass


class AvailabilityResponse(AvailabilityBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CalendarAvailabilityResponse(BaseModel):
    date: date
    available_slots: int
    status: str
