from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    email: str
    role: str = "driver"


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
