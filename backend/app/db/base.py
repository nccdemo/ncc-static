from app.database import Base

# Import all models to ensure they are registered on Base.metadata.
from app.models.availability import Availability  # noqa: F401
from app.models.booking import Booking  # noqa: F401
from app.models.company import Company  # noqa: F401
from app.models.driver import Driver  # noqa: F401
from app.models.service_log import ServiceLog  # noqa: F401
from app.models.tour import Tour  # noqa: F401
from app.models.trip import Trip  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.vehicle import Vehicle  # noqa: F401

__all__ = [
    "Base",
    "Company",
    "User",
    "Tour",
    "Booking",
    "Driver",
    "Vehicle",
    "Availability",
    "ServiceLog",
    "Trip",
]
