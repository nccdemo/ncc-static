from pydantic import BaseModel, ConfigDict, Field, model_validator


class TourInstanceVehicleSummary(BaseModel):
    vehicle_id: int
    name: str
    seats: int
    quantity: int


class TourInstancePrimaryVehicle(BaseModel):
    """Primary vehicle shown on instance payloads (safe for public APIs)."""

    id: int
    name: str
    plate: str | None = None


class TourInstancePublicBookingResponse(BaseModel):
    """Minimal tour instance for public booking (GET /tour-instances/{id})."""

    id: int
    tour_id: int
    date: str
    available_seats: int
    driver_name: str | None = None
    vehicle_name: str | None = None
    vehicle_plate: str | None = None
    vehicle: TourInstancePrimaryVehicle | None = None


class PublicTourInstanceListItem(BaseModel):
    """``GET /public/tour-instances`` — bookable upcoming slots."""

    tour_instance_id: int
    title: str
    date: str
    time: str | None = Field(None, description="Instance start time (HH:MM), if set.")
    available_seats: int
    price: float = Field(
        ...,
        description="Per-seat EUR: instance override if set, else tour base × 1.25 (checkout-style).",
    )
    driver_name: str | None = None


class TourInstanceCatalogItem(BaseModel):
    """One bookable tour instance for public listing (tourist client)."""

    id: int
    tour_id: int
    tour_title: str
    city: str | None = None
    date: str
    available_seats: int
    base_price: float = Field(..., description="Tour unit price before checkout markup.")
    checkout_unit_eur: float = Field(
        ...,
        description="Per-seat EUR at Stripe checkout (matches backend ``tour.price × 1.25``).",
    )


class TourInstanceAvailabilityResponse(BaseModel):
    """Per-instance stats for GET /api/tours/{tour_id}/instances."""

    id: int
    tour_id: int
    date: str | None = None  # ISO 8601 datetime (instance start of day)
    start_time: str | None = Field(None, description="Local start time HH:MM if set.")
    status: str
    capacity: int
    booked: int
    available: int
    total_seats: int = 0
    available_seats: int = 0
    vehicles: list[TourInstanceVehicleSummary] = Field(default_factory=list)

    @model_validator(mode='before')
    @classmethod
    def sync_seat_aliases(cls, data):
        if isinstance(data, dict):
            cap = int(data.get('capacity') or 0)
            av = int(data.get('available') or 0)
            data['total_seats'] = int(data.get('total_seats', cap))
            data['available_seats'] = int(data.get('available_seats', av))
            if not data.get('vehicles'):
                data['vehicles'] = []
        return data


class TourInstancePublicEmbed(BaseModel):
    """Instance slot on public tour listing."""

    id: int
    date: str = ""
    capacity: int = 0
    booked: int = 0
    available: int = 0


class TourBase(BaseModel):
    title: str
    description: str | None = None
    city: str | None = None
    price: float
    duration: int | None = None
    capacity: int = 7
    occupied_seats: int = 0
    images: list[str] = Field(default_factory=list)
    type: str = "tour"
    active: bool = True


class TourCreate(TourBase):
    pass


class TourResponse(TourBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_driver_id: int | None = None


class TourPublicResponse(BaseModel):
    """Public catalog fields (``base_price`` is the driver-side unit price before 1.25 markup)."""

    id: int
    title: str
    description: str | None = None
    base_price: float
    images: list[str] = Field(default_factory=list)
    city: str | None = None
    duration: int | None = None
