"""Automatic trip lifecycle cleanup: expire stale rows and optionally purge old terminal trips."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.booking import Booking
from app.models.trip import Trip, TripStatus
from app.services.trip_service import TripService
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

_TERMINAL = frozenset(
    {TripStatus.COMPLETED, TripStatus.CANCELLED, TripStatus.EXPIRED},
)


def _backfill_scheduled_at(db: Session) -> int:
    """
    Backfill in small batches so one job does not hold a huge transaction
    (fewer row locks / less pool contention with API traffic).
    """
    try:
        limit = max(1, min(500, int(os.getenv("TRIP_CLEANUP_BACKFILL_LIMIT", "150"))))
    except ValueError:
        limit = 150
    batch_commit = 50
    rows = (
        db.query(Trip)
        .filter(
            Trip.scheduled_at.is_(None),
            Trip.status.notin_(list(_TERMINAL)),
        )
        .limit(limit)
        .all()
    )
    n = 0
    pending = 0
    for t in rows:
        if TripService.ensure_trip_scheduled_at(db, t):
            n += 1
            pending += 1
            if pending >= batch_commit:
                db.commit()
                pending = 0
    if pending:
        db.commit()
    return n


def cleanup_trips() -> dict[str, int]:
    """
    - Expire open marketplace trips (``SCHEDULED`` / ``PENDING``, no driver) past ``scheduled_at`` + 30 min.
    - Expire stuck ``ACCEPTED`` trips past ``scheduled_at`` + 2 h (clear driver/vehicle assignment).
    - Hard-delete terminal trips older than 30 days with no linked booking (optional housekeeping).

    Runs in a background thread; failures are logged and must not affect API workers.
    """
    db = SessionLocal()
    stats = {
        "scheduled_backfilled": 0,
        "expired_open": 0,
        "expired_accepted": 0,
        "hard_deleted": 0,
    }
    try:
        stats["scheduled_backfilled"] = _backfill_scheduled_at(db)

        now = datetime.utcnow()
        cutoff_open = now - timedelta(minutes=30)
        cutoff_accepted = now - timedelta(hours=2)
        purge_before = now - timedelta(days=30)

        open_rows = (
            db.query(Trip)
            .filter(
                Trip.status.in_((TripStatus.SCHEDULED, TripStatus.PENDING)),
                Trip.driver_id.is_(None),
                Trip.scheduled_at.isnot(None),
                Trip.scheduled_at < cutoff_open,
            )
            .all()
        )
        for t in open_rows:
            t.status = TripStatus.EXPIRED
            db.add(t)
            stats["expired_open"] += 1

        accepted_rows = (
            db.query(Trip)
            .filter(
                Trip.status == TripStatus.ACCEPTED,
                Trip.scheduled_at.isnot(None),
                Trip.scheduled_at < cutoff_accepted,
            )
            .all()
        )
        freed_drivers: set[int] = set()
        for t in accepted_rows:
            prev = getattr(t, "driver_id", None)
            if prev is not None:
                freed_drivers.add(int(prev))
            t.status = TripStatus.EXPIRED
            t.driver_id = None
            t.vehicle_id = None
            t.assigned_at = None
            t.last_assigned_at = None
            db.add(t)
            stats["expired_accepted"] += 1

        if stats["expired_open"] or stats["expired_accepted"]:
            db.commit()
            for t in open_rows:
                manager.broadcast_sync(
                    {"event": "trip_updated", "trip_id": t.id, "status": TripStatus.EXPIRED.value}
                )
            for t in accepted_rows:
                manager.broadcast_sync(
                    {"event": "trip_updated", "trip_id": t.id, "status": TripStatus.EXPIRED.value}
                )
            for did in freed_drivers:
                TripService._set_driver_status(db, did, "available")

        has_booking = exists().where(Booking.trip_id == Trip.id)
        to_delete = (
            db.query(Trip)
            .filter(
                ~has_booking,
                or_(
                    and_(
                        Trip.status == TripStatus.COMPLETED,
                        Trip.completed_at.isnot(None),
                        Trip.completed_at < purge_before,
                    ),
                    and_(
                        Trip.status == TripStatus.EXPIRED,
                        Trip.scheduled_at.isnot(None),
                        Trip.scheduled_at < purge_before,
                    ),
                ),
            )
            .all()
        )
        for t in to_delete:
            db.delete(t)
            stats["hard_deleted"] += 1
        if stats["hard_deleted"]:
            db.commit()

        logger.info(
            "cleanup_trips: scheduled_backfilled=%s expired_open=%s expired_accepted=%s hard_deleted=%s",
            stats["scheduled_backfilled"],
            stats["expired_open"],
            stats["expired_accepted"],
            stats["hard_deleted"],
        )
        return stats
    except Exception:
        logger.exception("cleanup_trips failed")
        db.rollback()
        return stats
    finally:
        db.close()
