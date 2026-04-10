from __future__ import annotations

from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models.trip import Trip


def run() -> int:
    db = SessionLocal()
    updated = 0
    skipped = 0
    try:
        trips = (
            db.query(Trip)
            .options(joinedload(Trip.booking))
            .filter(Trip.company_id.is_(None))
            .all()
        )

        for t in trips:
            booking = getattr(t, "booking", None)
            booking_company_id = getattr(booking, "company_id", None) if booking else None
            if booking_company_id is None:
                skipped += 1
                continue
            t.company_id = booking_company_id
            updated += 1

        db.commit()

        print(
            f"Backfill complete. NULL trips: {len(trips)}, updated: {updated}, skipped: {skipped}"
        )
        return updated
    finally:
        db.close()


if __name__ == "__main__":
    run()

