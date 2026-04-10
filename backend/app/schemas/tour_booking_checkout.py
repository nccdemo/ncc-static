"""Stripe Checkout for tour instances: no DB booking until webhook fulfillment."""

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class TourBookingCheckoutCreate(BaseModel):
    """
    Create a Stripe Checkout Session for a tour instance.
    After successful payment, ``checkout.session.completed`` creates the ``Booking`` row.
    """

    model_config = ConfigDict(populate_by_name=True)

    tour_instance_id: int
    seats: int = Field(..., ge=1, validation_alias=AliasChoices("seats", "people"))
    customer_name: str
    email: str
    phone: str | None = Field(default=None, max_length=120)
    has_bnb: bool = False
    referral_code: str | None = None

    @field_validator("referral_code", mode="before")
    @classmethod
    def _normalize_referral_code(cls, v: object) -> str | None:
        if v is None:
            return None
        s = str(v).strip().upper()
        return s or None
