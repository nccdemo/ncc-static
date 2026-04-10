from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.service_sheet import build_service_sheet_data, generate_service_sheet_pdf_bytes

router = APIRouter(prefix="/service-sheet", tags=["service-sheet"])


@router.get("/{trip_id}")
def get_service_sheet(trip_id: int, db: Session = Depends(get_db)) -> dict:
    data = build_service_sheet_data(db=db, trip_id=trip_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return data.to_dict()


@router.get("/{trip_id}/pdf")
def get_service_sheet_pdf(trip_id: int, db: Session = Depends(get_db)) -> Response:
    from app.models.trip import Trip

    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    data = build_service_sheet_data(db=db, trip_id=trip_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    pdf_bytes = generate_service_sheet_pdf_bytes(data.to_dict())
    filename = f"service_sheet_{trip_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename=service_sheet_{trip_id}.pdf'},
    )

