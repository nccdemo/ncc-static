from datetime import datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class DriverBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    phone: str
    email: str | None = None
    is_active: bool = Field(default=True, validation_alias=AliasChoices("is_active", "active"))
    status: str = "available"
    latitude: float | None = None
    longitude: float | None = None
    last_location_update: datetime | None = None


class DriverCreate(DriverBase):
    pass


class DriverResponse(DriverBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    signup_status: str = "legacy"
    vehicle_plate_number: str | None = None
    vehicle_type: str | None = None
    vehicle_seats: int | None = None
    driver_license_number: str | None = None
    ncc_license_number: str | None = None
    insurance_number: str | None = None


class DriverRegisterRequest(BaseModel):
    name: str
    email: str
    phone: str
    password: str
    plate_number: str | None = Field(default=None, max_length=40)
    vehicle_type: str | None = Field(default=None, max_length=80)
    seats: int | None = Field(default=None, ge=1, le=60)
    driver_license_number: str | None = Field(default=None, max_length=80)
    ncc_license_number: str | None = Field(default=None, max_length=80)
    insurance_number: str | None = Field(default=None, max_length=80)


class DriverPendingSignupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    email: str | None
    signup_status: str
    vehicle_plate_number: str | None = None
    vehicle_type: str | None = None
    vehicle_seats: int | None = None
    driver_license_number: str | None = None
    ncc_license_number: str | None = None
    insurance_number: str | None = None
