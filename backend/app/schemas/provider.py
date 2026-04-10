"""Pydantic models for B&amp;B / provider resources."""

from pydantic import BaseModel, Field


class ProviderResponse(BaseModel):
    """Branding fields on ``providers`` (B&amp;B type)."""

    logo_url: str | None = Field(None, description="Public URL for logo image.")
    cover_image_url: str | None = Field(None, description="Public URL for cover / hero image.")
    display_name: str | None = Field(None, description="Customer-facing name (overrides legal ``name`` when set).")
