from __future__ import annotations

from datetime import datetime, time as time_type, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.driver import Driver
from app.models.booking import Booking
from app.models.vehicle import Vehicle
from app.models.driver_schedule import DriverSchedule
from app.models.driver_work_log import DriverWorkLog
from app.models.tour_instance import TourInstance
from app.models.trip import Trip, TripStatus
from app.services.trip_pricing import apply_commission_fields_to_trip
from app.services.websocket_manager import manager

# Driver-facing / assigned work must be tied to trip.driver_id (not booking-only).
_STATUSES_REQUIRE_ASSIGNED_DRIVER = frozenset(
    {
        TripStatus.ASSIGNED,
        TripStatus.ACCEPTED,
        TripStatus.EN_ROUTE,
        TripStatus.ARRIVED,
        TripStatus.IN_PROGRESS,
    }
)


class TripService:
    @staticmethod
    def resolve_scheduled_at(db: Session, trip: Trip) -> datetime | None:
        """
        Best-effort service start time (UTC-naive, consistent with ``eta`` / ``datetime.utcnow``).
        Used for marketplace expiry when ``scheduled_at`` was not set explicitly.
        """
        if getattr(trip, "scheduled_at", None) is not None:
            return trip.scheduled_at
        eta = getattr(trip, "eta", None)
        if eta is not None:
            return eta
        sd = getattr(trip, "service_date", None)
        if sd is None:
            return None
        booking = getattr(trip, "booking", None)
        if booking is None:
            booking = (
                db.query(Booking)
                .filter(Booking.trip_id == int(trip.id))
                .order_by(Booking.id.asc())
                .first()
            )
        tm = time_type.min
        if booking is not None:
            bt = getattr(booking, "time", None)
            if isinstance(bt, time_type):
                tm = bt
        try:
            return datetime.combine(sd, tm)
        except Exception:
            try:
                return datetime.combine(sd, time_type.min)
            except Exception:
                return None

    @staticmethod
    def ensure_trip_scheduled_at(db: Session, trip: Trip) -> bool:
        """Persist ``scheduled_at`` from booking/eta if missing. Returns True if updated."""
        if getattr(trip, "scheduled_at", None) is not None:
            return False
        resolved = TripService.resolve_scheduled_at(db, trip)
        if resolved is None:
            return False
        trip.scheduled_at = resolved
        db.add(trip)
        return True

    @staticmethod
    def resolve_vehicle_id_for_driver(db: Session, driver_id: int | None) -> int | None:
        if driver_id is None:
            return None
        driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
        if driver is None:
            return None
        vid = getattr(driver, "vehicle_id", None)
        if vid is not None:
            return int(vid)
        plate = (getattr(driver, "vehicle_plate_number", None) or "").strip()
        if not plate:
            return None
        row = db.query(Vehicle).filter(Vehicle.plate == plate).first()
        return int(row.id) if row is not None else None

    @staticmethod
    def ensure_trip_vehicle_matches_driver(db: Session, trip: Trip) -> bool:
        """
        When a trip has a driver, persist trip.vehicle_id from driver.vehicle_id
        (or plate match to vehicles). Returns True if trip was modified.
        """
        did = getattr(trip, "driver_id", None)
        if did is None:
            return False
        vid = TripService.resolve_vehicle_id_for_driver(db, int(did))
        if vid is None:
            return False
        if getattr(trip, "vehicle_id", None) == vid:
            return False
        trip.vehicle_id = int(vid)
        db.add(trip)
        return True

    @staticmethod
    def sync_trip_driver_from_bookings(db: Session, trip: Trip) -> bool:
        """
        If trip.driver_id is null but a linked booking has driver_id, copy to the trip.
        Aligns trip.vehicle_id with the driver's default vehicle when possible.
        Returns True if trip row was updated (caller should commit).
        """
        changed = False
        if getattr(trip, "driver_id", None) is None:
            bookings = (
                db.query(Booking)
                .filter(Booking.trip_id == int(trip.id))
                .order_by(Booking.id.asc())
                .all()
            )
            did = None
            for b in bookings:
                bd = getattr(b, "driver_id", None)
                if bd is not None:
                    did = int(bd)
                    break
            if did is not None:
                trip.driver_id = did
                db.add(trip)
                changed = True

        if TripService.ensure_trip_vehicle_matches_driver(db, trip):
            changed = True
        return changed

    @staticmethod
    def require_driver_for_status(db: Session, trip: Trip, status: TripStatus) -> None:
        """Active assigned/in-progress statuses require trip.driver_id."""
        if status not in _STATUSES_REQUIRE_ASSIGNED_DRIVER:
            return
        TripService.sync_trip_driver_from_bookings(db, trip)
        db.flush()
        if getattr(trip, "driver_id", None) is None:
            raise HTTPException(
                status_code=400,
                detail="Trip must have driver_id set; assign a driver on the trip first",
            )

    @staticmethod
    def _trip_amount_eur(db: Session, trip: Trip) -> float:
        booking = trip.booking
        if booking is None:
            booking = (
                db.query(Booking)
                .filter(Booking.trip_id == int(trip.id))
                .order_by(Booking.id.desc())
                .first()
            )
        return float(getattr(booking, "price", 0) or 0) if booking is not None else 0.0

    @staticmethod
    def _ensure_schedule_row(db: Session, trip: Trip) -> None:
        did = getattr(trip, "driver_id", None)
        svc_date = getattr(trip, "service_date", None)
        if did is None or svc_date is None:
            return
        existing = db.query(DriverSchedule).filter(DriverSchedule.trip_id == int(trip.id)).first()
        if existing is None:
            db.add(
                DriverSchedule(
                    driver_id=int(did),
                    trip_id=int(trip.id),
                    tour_instance_id=getattr(trip, "tour_instance_id", None),
                    date=svc_date,
                    start_time=None,
                    end_time=None,
                    status="assigned",
                )
            )
            db.commit()
        else:
            # keep driver/date in sync if trip reassigned
            changed = False
            if int(existing.driver_id) != int(did):
                existing.driver_id = int(did)
                changed = True
            if existing.date != svc_date:
                existing.date = svc_date
                changed = True
            if changed:
                db.commit()

    @staticmethod
    def _on_trip_completed(db: Session, trip: Trip) -> None:
        did = getattr(trip, "driver_id", None)
        svc_date = getattr(trip, "service_date", None)
        if did is None or svc_date is None:
            return

        amount = TripService._trip_amount_eur(db=db, trip=trip)

        # Work log: increment per day
        log = (
            db.query(DriverWorkLog)
            .filter(DriverWorkLog.driver_id == int(did), DriverWorkLog.date == svc_date)
            .first()
        )
        if log is None:
            log = DriverWorkLog(driver_id=int(did), date=svc_date, rides_count=0, total_amount=0.0)
            db.add(log)
            db.flush()
        log.rides_count = int(getattr(log, "rides_count", 0) or 0) + 1
        log.total_amount = float(getattr(log, "total_amount", 0.0) or 0.0) + float(amount)
        db.add(log)

        # Schedule: mark completed
        sch = db.query(DriverSchedule).filter(DriverSchedule.trip_id == int(trip.id)).first()
        if sch is None:
            sch = DriverSchedule(
                driver_id=int(did),
                trip_id=int(trip.id),
                tour_instance_id=getattr(trip, "tour_instance_id", None),
                date=svc_date,
                status="completed",
            )
            db.add(sch)
        else:
            sch.status = "completed"
            db.add(sch)

        db.commit()

    @staticmethod
    def _set_driver_status(db: Session, driver_id: int | None, status: str) -> None:
        if driver_id is None:
            return
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
        if driver is None:
            return
        if getattr(driver, "status", None) == status:
            return
        driver.status = status
        db.commit()
        db.refresh(driver)
        manager.broadcast_drivers_sync(
            {
                "driver_id": driver.id,
                "latitude": driver.latitude,
                "longitude": driver.longitude,
                "name": driver.name,
                "status": driver.status,
            }
        )

    @staticmethod
    def _driver_vehicle_from_tour_instance(
        db: Session, instance: TourInstance | None
    ) -> tuple[int | None, int | None]:
        if instance is None:
            return None, None
        did = getattr(instance, "driver_id", None)
        if did is None:
            raw = getattr(instance, "assigned_driver_ids", None)
            if isinstance(raw, list) and raw:
                try:
                    did = int(raw[0])
                except (TypeError, ValueError):
                    did = None
        vid = None
        vids = getattr(instance, "vehicle_ids", None)
        if isinstance(vids, list) and vids:
            try:
                vid = int(vids[0])
            except (TypeError, ValueError):
                vid = None
        if did is not None and vid is None:
            vid = TripService.resolve_vehicle_id_for_driver(db, int(did))
        return did, vid

    @staticmethod
    def create_from_booking(
        db: Session,
        booking,
        driver_id: int | None = None,
        vehicle_id: int | None = None,
        *,
        send_customer_notification: bool = False,
    ) -> Trip:
        now = datetime.utcnow()

        effective_driver_id = driver_id if driver_id is not None else getattr(booking, "driver_id", None)
        effective_vehicle_id = vehicle_id if vehicle_id is not None else getattr(booking, "vehicle_id", None)

        tour_instance_id = getattr(booking, "tour_instance_id", None)
        instance = None
        if tour_instance_id is not None:
            instance = db.query(TourInstance).filter(TourInstance.id == int(tour_instance_id)).first()
        ti_driver, ti_vehicle = TripService._driver_vehicle_from_tour_instance(db, instance)
        if effective_driver_id is None:
            effective_driver_id = ti_driver
        if effective_vehicle_id is None:
            effective_vehicle_id = ti_vehicle
        if effective_driver_id is not None and effective_vehicle_id is None:
            effective_vehicle_id = TripService.resolve_vehicle_id_for_driver(db, int(effective_driver_id))

        booking_date = getattr(booking, "date", None)
        booking_time = getattr(booking, "time", None)
        eta = None
        try:
            if booking_date is not None and booking_time is not None:
                eta = datetime.combine(booking_date, booking_time)
            elif booking_date is not None:
                # If time is missing, fall back to date-only (midnight).
                eta = datetime.combine(booking_date, datetime.min.time())
        except Exception:
            eta = None

        # Best-effort geocoding for navigation/tracking.
        # Prefer existing booking coords; if missing, try global Nominatim lookup and store on booking for reuse.
        from app.services.geocoding import geocode_address_for_booking

        pickup_lat, pickup_lng, dest_lat, dest_lng = geocode_address_for_booking(
            db,
            booking=booking,
        )

        initial_status = TripStatus.ASSIGNED if effective_driver_id is not None else TripStatus.SCHEDULED
        trip = Trip(
            company_id=getattr(booking, "company_id", None),
            tour_instance_id=int(tour_instance_id) if tour_instance_id is not None else None,
            driver_id=effective_driver_id,
            vehicle_id=effective_vehicle_id,
            status=initial_status,
            assigned_at=now if effective_driver_id is not None else None,
            last_assigned_at=now if effective_driver_id is not None else None,
            service_date=booking_date,
            pickup=getattr(booking, "pickup", None),
            destination=getattr(booking, "destination", None),
            pickup_lat=(float(pickup_lat) if pickup_lat is not None else None),
            pickup_lng=(float(pickup_lng) if pickup_lng is not None else None),
            destination_lat=(float(dest_lat) if dest_lat is not None else None),
            destination_lng=(float(dest_lng) if dest_lng is not None else None),
            dropoff_lat=(float(dest_lat) if dest_lat is not None else None),
            dropoff_lng=(float(dest_lng) if dest_lng is not None else None),
            tracking_token=str(uuid4()),
            eta=eta,
            scheduled_at=eta,
            passengers=int(getattr(booking, "people", 1) or 1),
        )
        apply_commission_fields_to_trip(trip, booking)
        db.add(trip)
        db.flush()
        if trip.scheduled_at is None:
            TripService.ensure_trip_scheduled_at(db, trip)
        booking.trip_id = trip.id
        if effective_driver_id is not None:
            if getattr(booking, "driver_id", None) is None:
                booking.driver_id = int(effective_driver_id)
            if effective_vehicle_id is not None and getattr(booking, "vehicle_id", None) is None:
                booking.vehicle_id = int(effective_vehicle_id)
            db.add(booking)
        db.commit()
        db.refresh(trip)
        # Persist geocoded coordinates on booking as well (best-effort).
        try:
            db.refresh(booking)
        except Exception:
            pass

        print("NEW TRIP CREATED")
        print("Trip ID:", trip.id)

        if send_customer_notification:
            try:
                from app.config import public_tracking_url
                from app.services.email_service import send_email

                to_email = (getattr(booking, "email", None) or "").strip()
                if to_email:
                    track_url = public_tracking_url(getattr(trip, "tracking_token", None))
                    send_email(
                        to_email=to_email,
                        subject=f"Trip created (#{trip.id})",
                        body=(
                            "Your trip has been created.\n\n"
                            f"Trip ID: {trip.id}\n"
                            f"Pickup: {getattr(booking, 'pickup', '-')}\n"
                            f"Destination: {getattr(booking, 'destination', '-')}\n"
                            f"Tracking: {track_url}\n"
                        ),
                    )
            except Exception as e:
                print("EMAIL ERROR:", str(e))

        print("Trip created with:")
        print("Pickup:", getattr(booking, "pickup", None))
        print("ETA:", eta)

        if effective_driver_id is not None:
            TripService._set_driver_status(db=db, driver_id=effective_driver_id, status="on_trip")
            TripService._ensure_schedule_row(db=db, trip=trip)

        return trip

    @staticmethod
    def _naive_utc(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt
        return dt.astimezone(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def create_dispatch_transfer_trip(
        db: Session,
        *,
        customer_name: str,
        pickup: str,
        dropoff: str,
        ride_at: datetime,
    ) -> Trip:
        """
        Manual / dispatcher transfer: open marketplace trip (no driver) plus a confirmed
        booking so ``GET /api/driver/today-trips`` can surface it after assignment.
        """
        ride_at = TripService._naive_utc(ride_at)
        svc_date = ride_at.date()
        trip = Trip(
            status=TripStatus.SCHEDULED,
            driver_id=None,
            vehicle_id=None,
            service_date=svc_date,
            pickup=(pickup or "").strip(),
            destination=(dropoff or "").strip(),
            scheduled_at=ride_at,
            eta=ride_at,
            passengers=1,
            tracking_token=str(uuid4()),
            notes=f"Customer: {(customer_name or '').strip()}",
        )
        try:
            from app.services.geocoding import geocode_address

            pu = trip.pickup
            if pu:
                g = geocode_address(str(pu))
                if g is not None:
                    plat, plng = g
                    trip.pickup_lat = plat
                    trip.pickup_lng = plng
            dest = trip.destination
            if dest:
                g = geocode_address(str(dest))
                if g is not None:
                    dlat, dlng = g
                    trip.destination_lat = dlat
                    trip.destination_lng = dlat
                    trip.dropoff_lat = dlat
                    trip.dropoff_lng = dlng
        except Exception:
            pass

        db.add(trip)
        db.flush()
        TripService.ensure_trip_scheduled_at(db, trip)

        booking = Booking(
            customer_name=(customer_name or "").strip() or "—",
            email="dispatch@example.com",
            phone="—",
            date=svc_date,
            time=ride_at.time(),
            people=1,
            price=0.0,
            status="confirmed",
            pickup=trip.pickup,
            destination=trip.destination,
            trip_id=int(trip.id),
            pickup_latitude=trip.pickup_lat,
            pickup_longitude=trip.pickup_lng,
            dropoff_latitude=trip.dropoff_lat,
            dropoff_longitude=trip.dropoff_lng,
        )
        db.add(booking)
        apply_commission_fields_to_trip(trip, booking)
        db.add(trip)
        db.commit()
        db.refresh(trip)

        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def driver_claim_trip(db: Session, trip_id: int, driver_id: int) -> Trip:
        """
        Marketplace accept: first driver wins. Sets ASSIGNED and assigns driver_id.
        """
        driver = db.query(Driver).filter(Driver.id == int(driver_id)).first()
        if driver is None:
            raise HTTPException(status_code=404, detail="Driver not found")
        if not bool(getattr(driver, "is_active", True)):
            raise HTTPException(status_code=403, detail="Account is not active")

        now = datetime.utcnow()
        updated = (
            db.query(Trip)
            .filter(
                Trip.id == int(trip_id),
                Trip.driver_id.is_(None),
                Trip.status.in_((TripStatus.SCHEDULED, TripStatus.PENDING)),
            )
            .update(
                {
                    "driver_id": int(driver_id),
                    "status": TripStatus.ASSIGNED,
                    "assigned_at": now,
                    "last_assigned_at": now,
                },
                synchronize_session=False,
            )
        )
        if updated == 0:
            trip = db.query(Trip).filter(Trip.id == int(trip_id)).first()
            if trip is None:
                raise HTTPException(status_code=404, detail="Trip not found")
            existing = getattr(trip, "driver_id", None)
            if existing is not None:
                if int(existing) == int(driver_id):
                    TripService.ensure_trip_vehicle_matches_driver(db, trip)
                    for b in db.query(Booking).filter(Booking.trip_id == int(trip_id)).all():
                        b.driver_id = int(driver_id)
                        vid = getattr(trip, "vehicle_id", None)
                        if vid is not None:
                            b.vehicle_id = int(vid)
                        db.add(b)
                    TripService.ensure_trip_scheduled_at(db, trip)
                    db.add(trip)
                    db.commit()
                    db.refresh(trip)
                    return trip
                raise HTTPException(
                    status_code=409,
                    detail="Trip already has a driver",
                )
            raise HTTPException(
                status_code=400,
                detail="Trip is not open for acceptance",
            )

        db.commit()
        trip = db.query(Trip).filter(Trip.id == int(trip_id)).first()
        if trip is None:
            raise HTTPException(status_code=404, detail="Trip not found")
        TripService.ensure_trip_vehicle_matches_driver(db, trip)
        for b in db.query(Booking).filter(Booking.trip_id == int(trip_id)).all():
            b.driver_id = int(driver_id)
            vid = getattr(trip, "vehicle_id", None)
            if vid is not None:
                b.vehicle_id = int(vid)
            db.add(b)
        db.add(trip)
        TripService.ensure_trip_scheduled_at(db, trip)
        db.commit()
        db.refresh(trip)

        TripService._set_driver_status(db=db, driver_id=int(driver_id), status="on_trip")
        TripService._ensure_schedule_row(db=db, trip=trip)

        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def assign_driver(
        db: Session,
        trip: Trip,
        driver_id: int,
        vehicle_id: int | None,
    ) -> Trip:
        now = datetime.utcnow()

        prev_driver_id = trip.driver_id
        resolved_vehicle_id = vehicle_id
        if resolved_vehicle_id is None:
            resolved_vehicle_id = TripService.resolve_vehicle_id_for_driver(db, int(driver_id))
        trip.driver_id = driver_id
        trip.vehicle_id = resolved_vehicle_id
        trip.status = TripStatus.ASSIGNED
        trip.assigned_at = now

        for b in db.query(Booking).filter(Booking.trip_id == int(trip.id)).all():
            b.driver_id = int(driver_id)
            if resolved_vehicle_id is not None:
                b.vehicle_id = int(resolved_vehicle_id)
            db.add(b)

        db.commit()
        db.refresh(trip)

        # Driver assignment: mark new driver busy; mark previous driver available.
        if prev_driver_id is not None and prev_driver_id != driver_id:
            TripService._set_driver_status(db=db, driver_id=prev_driver_id, status="available")
        TripService._set_driver_status(db=db, driver_id=driver_id, status="on_trip")
        TripService._ensure_schedule_row(db=db, trip=trip)

        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def update_status(db: Session, trip: Trip, status: TripStatus) -> Trip:
        now = datetime.utcnow()

        TripService.require_driver_for_status(db, trip, status)

        trip.status = status
        if status == TripStatus.IN_PROGRESS:
            trip.started_at = now
        if status == TripStatus.COMPLETED:
            trip.completed_at = now

        db.commit()
        db.refresh(trip)

        if status == TripStatus.COMPLETED:
            TripService._set_driver_status(db=db, driver_id=trip.driver_id, status="available")
            TripService._on_trip_completed(db=db, trip=trip)

        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def accept_trip(db: Session, trip: Trip) -> Trip:
        TripService.require_driver_for_status(db, trip, TripStatus.ACCEPTED)
        trip.status = TripStatus.ACCEPTED
        db.commit()
        db.refresh(trip)
        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def reject_trip(db: Session, trip: Trip) -> Trip:
        prev_driver_id = trip.driver_id
        trip.status = TripStatus.SCHEDULED
        trip.driver_id = None
        trip.vehicle_id = None
        trip.assigned_at = None
        trip.last_assigned_at = None
        db.commit()
        db.refresh(trip)

        # Trip rejected: driver is available again.
        TripService._set_driver_status(db=db, driver_id=prev_driver_id, status="available")

        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def admin_cancel_trip(db: Session, trip: Trip) -> Trip:
        """
        Admin cancellation: ``CANCELLED``, clears driver/vehicle; frees previous driver if any.
        """
        if trip.status in (TripStatus.COMPLETED, TripStatus.EXPIRED, TripStatus.CANCELLED):
            raise HTTPException(
                status_code=400,
                detail="Trip is already completed, expired, or cancelled",
            )
        prev_driver_id = trip.driver_id
        trip.status = TripStatus.CANCELLED
        trip.driver_id = None
        trip.vehicle_id = None
        trip.assigned_at = None
        trip.last_assigned_at = None
        db.commit()
        db.refresh(trip)

        TripService._set_driver_status(db=db, driver_id=prev_driver_id, status="available")

        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def driver_cancel_own_trip(db: Session, *, trip: Trip, driver_id: int) -> Trip:
        """
        Driver-initiated cancellation: only ``ACCEPTED`` trips for the assigned driver.
        Sets ``CANCELLED``, clears assignment; does not delete the row.
        """
        if getattr(trip, "driver_id", None) is None or int(trip.driver_id) != int(driver_id):
            raise HTTPException(status_code=403, detail="Not your trip")
        if trip.status in (TripStatus.COMPLETED, TripStatus.EXPIRED, TripStatus.CANCELLED):
            raise HTTPException(
                status_code=400,
                detail="Trip cannot be cancelled in current status",
            )
        if trip.status != TripStatus.ACCEPTED:
            raise HTTPException(
                status_code=400,
                detail="Only accepted trips can be cancelled by the driver",
            )

        prev_driver_id = trip.driver_id
        trip.status = TripStatus.CANCELLED
        trip.driver_id = None
        trip.vehicle_id = None
        trip.assigned_at = None
        trip.last_assigned_at = None
        db.commit()
        db.refresh(trip)

        TripService._set_driver_status(db=db, driver_id=prev_driver_id, status="available")

        manager.broadcast_sync(
            {"event": "trip_updated", "trip_id": trip.id, "status": trip.status.value}
        )
        TripService._broadcast_trip_live_update(db=db, trip=trip)
        return trip

    @staticmethod
    def _broadcast_trip_live_update(db: Session, trip: Trip) -> None:
        """
        Broadcast map-ready data for live dashboards.
        Best-effort only (no exceptions raised).
        """
        try:
            from app.models.driver import Driver
            from app.services.dispatch_service import (
                compute_eta_to_pickup_minutes,
                resolve_pickup_lat_lng,
            )

            booking = trip.booking
            pickup_lat, pickup_lng = resolve_pickup_lat_lng(trip, booking)

            driver = None
            if trip.driver_id is not None:
                driver = db.query(Driver).filter(Driver.id == trip.driver_id).first()

            eta_to_pickup = None
            if driver:
                eta_to_pickup = compute_eta_to_pickup_minutes(
                    driver.latitude,
                    driver.longitude,
                    pickup_lat,
                    pickup_lng,
                )

            manager.broadcast_sync(
                {
                    "event": "trip_live_update",
                    "trip_id": trip.id,
                    "status": trip.status.value,
                    "driver": (
                        {
                            "driver_id": driver.id,
                            "lat": driver.latitude,
                            "lng": driver.longitude,
                        }
                        if driver
                        else None
                    ),
                    "eta_to_pickup_minutes": eta_to_pickup,
                }
            )
        except Exception:
            return
