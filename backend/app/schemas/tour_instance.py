from pydantic import BaseModel, Field


class TourInstanceVehicleItem(BaseModel):
    vehicle_id: int
    name: str
    seats: int = 0
    quantity: int = 1


class TourInstanceVehiclePrimary(BaseModel):
    id: int
    name: str
    plate: str | None = None


class TourInstanceResponse(BaseModel):
    """
    Tour instance payload used by admin UIs.
    Includes driver + vehicle info for quick rendering.
    """

    id: int
    tour_id: int
    date: str
    start_time: str | None = None
    status: str | None = None

    capacity: int | None = None
    booked: int | None = None
    available: int | None = None
    total_seats: int | None = None
    available_seats: int | None = None

    driver_id: int | None = None
    driver_ids: list[int] = Field(default_factory=list)
    driver_name: str | None = None

    vehicle_name: str | None = None
    vehicle_plate: str | None = None
    vehicle_ids: list[int] = Field(default_factory=list)
    vehicles: list[TourInstanceVehicleItem] = Field(default_factory=list)
    vehicle: TourInstanceVehiclePrimary | None = None

