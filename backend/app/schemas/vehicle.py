from pydantic import BaseModel, ConfigDict


class VehicleBase(BaseModel):
    name: str
    seats: int
    plate: str | None = None
    active: bool = True


class VehicleCreate(VehicleBase):
    pass


class VehicleResponse(VehicleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
