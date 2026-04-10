from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.crud.vehicle import create_vehicle, delete_vehicle, get_vehicles
from app.database import get_db
from app.deps.auth import require_admin
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleResponse

router = APIRouter(
    prefix="/vehicles",
    tags=["vehicles"],
    dependencies=[Depends(require_admin)],
)


@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle_endpoint(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
) -> VehicleResponse:
    return create_vehicle(db, payload)


@router.get("/", response_model=list[VehicleResponse])
def list_vehicles_endpoint(
    db: Session = Depends(get_db),
) -> list[VehicleResponse]:
    return get_vehicles(db)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle_endpoint(
    vehicle_id: int,
    db: Session = Depends(get_db),
) -> Response:
    if not delete_vehicle(db, vehicle_id):
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
