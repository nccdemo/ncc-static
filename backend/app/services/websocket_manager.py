import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self.tour_instance_connections: dict[int, list[WebSocket]] = {}
        self.drivers_connections: list[WebSocket] = []
        self.tracking_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    async def connect_tour_instance(self, tour_instance_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.tour_instance_connections.setdefault(tour_instance_id, []).append(websocket)

    async def connect_tracking(self, trip_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.tracking_connections.setdefault(trip_id, []).append(websocket)

    async def connect_drivers(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.drivers_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.drivers_connections:
            self.drivers_connections.remove(websocket)
        for _, conns in list(self.tour_instance_connections.items()):
            if websocket in conns:
                conns.remove(websocket)
        for _, conns in list(self.tracking_connections.items()):
            if websocket in conns:
                conns.remove(websocket)

    async def send_personal_message(self, message: Any, websocket: WebSocket) -> None:
        await websocket.send_text(json.dumps(message, default=str))

    async def broadcast(self, message: Any) -> None:
        data = json.dumps(message, default=str)
        stale: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(data)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)

    async def broadcast_tour_instance(self, tour_instance_id: int, message: Any) -> None:
        data = json.dumps(message, default=str)
        stale: list[WebSocket] = []
        for connection in list(self.tour_instance_connections.get(tour_instance_id, [])):
            try:
                await connection.send_text(data)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)

    async def broadcast_tracking(self, trip_id: int, message: Any) -> None:
        data = json.dumps(message, default=str)
        stale: list[WebSocket] = []
        for connection in list(self.tracking_connections.get(trip_id, [])):
            try:
                await connection.send_text(data)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)

    async def broadcast_drivers(self, message: Any) -> None:
        data = json.dumps(message, default=str)
        stale: list[WebSocket] = []
        for connection in list(self.drivers_connections):
            try:
                await connection.send_text(data)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)

    def broadcast_sync(self, message: Any) -> None:
        """
        Schedule a broadcast from sync code without breaking request handlers.
        If no event loop is running, this becomes a no-op.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.broadcast(message))

    def broadcast_driver_location_sync(
        self,
        driver_id: int,
        lat: float,
        lng: float,
        *,
        timestamp: str | None = None,
        trip_id: int | None = None,
    ) -> None:
        """
        Live driver GPS for all clients on ``/ws/trips``.

        Core fields (always present): ``driver_id``, ``lat``, ``lng``.
        ``event`` is set for existing dispatch UIs; optional ``timestamp`` / ``trip_id`` when known.
        """
        msg: dict[str, Any] = {
            "event": "driver_location_update",
            "driver_id": int(driver_id),
            "lat": float(lat),
            "lng": float(lng),
        }
        if timestamp is not None:
            msg["timestamp"] = timestamp
        if trip_id is not None:
            msg["trip_id"] = int(trip_id)
        self.broadcast_sync(msg)

    def broadcast_drivers_sync(self, message: Any) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.broadcast_drivers(message))

    def broadcast_tour_instance_sync(self, tour_instance_id: int, message: Any) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.broadcast_tour_instance(tour_instance_id, message))

    def broadcast_tracking_sync(self, trip_id: int, message: Any) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.broadcast_tracking(trip_id, message))


manager = ConnectionManager()

