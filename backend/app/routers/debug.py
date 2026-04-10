"""Debug-only routes (no auth). Remove or protect before production."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.driver import Driver

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/drivers")
def debug_list_drivers(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(Driver).order_by(Driver.id).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "email": d.email,
            "phone": d.phone,
            "is_active": d.is_active,
            "status": d.status,
        }
        for d in rows
    ]
