from sqlalchemy.orm import Session

from app.models.tour import Tour
from app.schemas.tour import TourCreate


def get_tours(db: Session, only_active: bool = True, *, company_id: int | None = None) -> list[Tour]:
    query = db.query(Tour)
    if only_active:
        query = query.filter(Tour.active.is_(True))
    if company_id is not None:
        query = query.filter(Tour.company_id == int(company_id))
    return query.all()


def create_tour(db: Session, payload: TourCreate, *, company_id: int | None = None, owner_driver_id: int | None = None) -> Tour:
    data = payload.model_dump()
    if company_id is not None:
        data["company_id"] = int(company_id)
    if owner_driver_id is not None:
        data["owner_driver_id"] = int(owner_driver_id)
    tour = Tour(**data)
    db.add(tour)
    db.commit()
    db.refresh(tour)
    return tour
