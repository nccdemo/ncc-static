from sqlalchemy.orm import Session

from app.models.tour import Tour
from app.schemas.tour import TourCreate


def get_tours(db: Session, only_active: bool = True) -> list[Tour]:
    query = db.query(Tour)
    if only_active:
        query = query.filter(Tour.active.is_(True))
    return query.all()


def create_tour(db: Session, payload: TourCreate) -> Tour:
    tour = Tour(**payload.model_dump())
    db.add(tour)
    db.commit()
    db.refresh(tour)
    return tour
