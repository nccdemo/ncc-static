from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.tour_instance import TourInstance
from app.models.tour_instance_vehicle import TourInstanceVehicle
from app.models.vehicle import Vehicle

from app.services.websocket_manager import manager

router = APIRouter(tags=["WebSockets"])


@router.websocket("/ws/trips")
async def ws_trips(websocket: WebSocket):
    """
    Dispatch / ops clients subscribe here for trip lifecycle and **live driver GPS**.

    Driver apps send coordinates via ``POST /api/driver/location`` (or legacy drivers
    location endpoints); the server pushes JSON to this channel, including::

        {"event": "driver_location_update", "driver_id": <int>, "lat": <float>, "lng": <float>}
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep alive; clients may optionally send pings/messages.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
        raise


@router.websocket("/ws/drivers")
async def ws_drivers(websocket: WebSocket):
    await manager.connect_drivers(websocket)
    try:
        while True:
            # Keep alive; clients may optionally send pings/messages.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
        raise


@router.websocket("/ws/tracking/{trip_id}")
async def ws_tracking(websocket: WebSocket, trip_id: int):
    await manager.connect_tracking(trip_id, websocket)
    try:
        while True:
            # Keep alive; clients may optionally send pings/messages.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
        raise


@router.websocket("/api/ws/tour-instances/{instance_id}")
async def ws_tour_instance(
    websocket: WebSocket,
    instance_id: int,
    db: Session = Depends(get_db),
):
    await manager.connect_tour_instance(instance_id, websocket)
    try:
        instance = db.query(TourInstance).filter(TourInstance.id == instance_id).first()
        if instance is None:
            await manager.send_personal_message({"type": "error", "detail": "Tour instance not found"}, websocket)
            return

        bookings = (
            db.query(Booking)
            .filter(Booking.tour_instance_id == instance_id)
            .order_by(Booking.id.desc())
            .all()
        )
        payload_bookings = [
            {
                "id": b.id,
                "name": b.customer_name,
                "passengers": int(b.people),
                "status": "checked_in" if getattr(b, "checked_in", False) else "pending",
            }
            for b in bookings
        ]
        capacity = (
            db.query(func.coalesce(func.sum(Vehicle.seats * TourInstanceVehicle.quantity), 0))
            .join(Vehicle, Vehicle.id == TourInstanceVehicle.vehicle_id)
            .filter(TourInstanceVehicle.tour_instance_id == instance_id)
            .scalar()
            or 0
        )
        occupied = (
            db.query(func.coalesce(func.sum(Booking.people), 0))
            .filter(Booking.tour_instance_id == instance_id, Booking.checked_in.is_(True))
            .scalar()
            or 0
        )

        await manager.send_personal_message(
            {
                "type": "init",
                "bookings": payload_bookings,
                "status": instance.status,
                "capacity": int(capacity),
                "occupied": int(occupied),
            },
            websocket,
        )

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
        raise

