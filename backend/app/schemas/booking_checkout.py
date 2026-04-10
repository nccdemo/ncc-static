"""Public booking → Stripe Checkout (alias-friendly request body)."""

from pydantic import BaseModel, EmailStr, Field, field_validator


class BookingCreateCheckoutRequest(BaseModel):
    tour_instance_id: int
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_email: EmailStr
    customer_phone: str = Field(..., min_length=3, max_length=120)
    seats: int = Field(..., ge=1, le=500)
    referral_code: str | None = None

    @field_validator("referral_code", mode="before")
    @classmethod
    def _normalize_referral_code(cls, v: object) -> str | None:
        if v is None:
            return None
        s = str(v).strip().upper()
        return s or None


class BookingCreateCheckoutResponse(BaseModel):
    checkout_url: str
