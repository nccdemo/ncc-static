from datetime import date as Date, time as Time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import FRONTEND_URL
from app.constants.booking_capacity import HELD_BOOKING_STATUSES
from app.crud.booking import get_bookings
from app.database import get_db
from app.deps.auth import require_admin
from app.models.booking import Booking
from app.models.quote import Quote
from app.models.tour import Tour
from app.models.trip import Trip, TripStatus
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingResponse, TourInstanceBookingResult
from app.services.email_service import (
    build_booking_email_body,
    send_booking_refunded_email,
    send_custom_ride_quote_email,
    send_email,
)
from app.services.geocoding import geocode_address
from app.services.pricing import calculate_price
from app.services.flight_service import lookup_flight_aviationstack, normalize_flight_number
from app.services.qr_service import generate_booking_qr
from app.services.referral_booking import resolve_valid_bnb_referral
from app.services.websocket_manager import manager
from app.models.tour_instance import TourInstance
from app.routers.tour_instances import _instance_blocks_new_bookings, compute_capacity_from_db
import app.services.stripe_service as stripe_service
from zoneinfo import ZoneInfo

router = APIRouter(prefix="/bookings", tags=["bookings"])

# Raw SQL uses column `people` for seat count (API field: `seats`).
_CAPACITY_SQL = text(
    """
    SELECT LEAST(
        COALESCE((
            SELECT SUM(v.seats * tiv.quantity)
            FROM tour_instance_vehicles AS tiv
            INNER JOIN vehicles AS v ON v.id = tiv.vehicle_id
            WHERE tiv.tour_instance_id = :tour_instance_id
        ), 0)::bigint,
        COALESCE((
            SELECT available_seats FROM tour_instances WHERE id = :tour_instance_id
        ), 999999)::bigint
    ) AS capacity
    """
)
_BOOKED_HELD_SQL = text(
    """
    SELECT COALESCE(SUM(people), 0)::bigint AS booked
    FROM bookings
    WHERE tour_instance_id = :tour_instance_id
      AND LOWER(TRIM(status)) IN ('pending', 'paid', 'confirmed')
    """
)
_LOCK_INSTANCE_SQL = text(
    """
    SELECT id, tour_id, date
    FROM tour_instances
    WHERE id = :tour_instance_id
    FOR UPDATE
    """
)
_INSERT_BOOKING_SQL = text(
    """
    INSERT INTO bookings (
        company_id,
        client_id,
        tour_id,
        tour_instance_id,
        customer_name,
        email,
        phone,
        date,
        time,
        people,
        price,
        status,
        referral_code,
        bnb_id
    ) VALUES (
        :company_id,
        :client_id,
        :tour_id,
        :tour_instance_id,
        :customer_name,
        :email,
        :phone,
        :date,
        CAST(:time AS TIME),
        :people,
        :price,
        :status,
        :referral_code,
        :bnb_id
    )
    RETURNING id
    """
)


def _normalize_booking_status(value: str | None, *, default: str) -> str:
    allowed = {"pending", "paid", "confirmed", "cancelled"}
    raw = (value or default).strip().lower()
    return raw if raw in allowed else default


def _normalize_new_booking_status(value: str | None, *, default: str = "pending") -> str:
    """Statuses allowed on create (cancelled must not skip seat hold)."""
    allowed = {"pending", "paid", "confirmed"}
    raw = (value or default).strip().lower()
    return raw if raw in allowed else default


def _run_tour_instance_booking(
    db: Session,
    payload: BookingCreate,
    *,
    company_id: int | None,
    booking_status: str,
) -> tuple[int, int, int, int, str, int]:
    """
    Lock tour_instances row (FOR UPDATE), recompute held seats, insert booking.
    Returns booking_id, new_available, capacity, occupied_after, customer_name, seats.
    """
    if payload.seats < 1:
        raise HTTPException(status_code=400, detail="seats must be >= 1")

    normalized_status = _normalize_booking_status(booking_status, default="pending")

    name = (payload.customer_name or "").strip() or "Guest"
    email = (payload.email or "").strip() or "noreply@booking.local"
    phone = (payload.phone or "").strip() or "N/A"
    time_str = (
        payload.time.strftime("%H:%M:%S")
        if payload.time is not None
        else "00:00:00"
    )

    with db.begin():
        inst = db.execute(
            _LOCK_INSTANCE_SQL,
            {"tour_instance_id": payload.tour_instance_id},
        ).mappings().first()
        if inst is None:
            raise HTTPException(status_code=404, detail="Tour instance not found")

        ti_row = db.query(TourInstance).filter(TourInstance.id == payload.tour_instance_id).first()
        if ti_row is not None and _instance_blocks_new_bookings(ti_row):
            raise HTTPException(
                status_code=400,
                detail="Turno non disponibile per nuove prenotazioni (annullato o completato)",
            )

        booking_date = payload.date if payload.date is not None else inst["date"]
        tour_id = int(payload.tour_id) if payload.tour_id is not None else int(inst["tour_id"])

        if payload.client_id is not None:
            if db.query(User).filter(User.id == payload.client_id).first() is None:
                raise HTTPException(status_code=404, detail="Client not found")

        tour = db.query(Tour).filter(Tour.id == tour_id).first()
        if tour is None:
            raise HTTPException(status_code=404, detail="Tour not found")
        unit = float(tour.price or 0.0)
        if payload.price is None:
            price = unit * int(payload.seats)
        else:
            price = float(payload.price)

        capacity_row = db.execute(
            _CAPACITY_SQL,
            {"tour_instance_id": payload.tour_instance_id},
        ).mappings().first()
        booked_row = db.execute(
            _BOOKED_HELD_SQL,
            {"tour_instance_id": payload.tour_instance_id},
        ).mappings().first()

        capacity = int(capacity_row["capacity"] or 0)
        booked = int(booked_row["booked"] or 0)
        available = capacity - booked

        if payload.seats > available:
            raise HTTPException(status_code=400, detail="Posti non disponibili")

        ref_stored, bnb_id = resolve_valid_bnb_referral(db, payload.referral_code)

        booking_id = int(
            db.execute(
                _INSERT_BOOKING_SQL,
                {
                    "company_id": company_id,
                    "client_id": payload.client_id,
                    "tour_id": tour_id,
                    "tour_instance_id": payload.tour_instance_id,
                    "customer_name": name,
                    "email": email,
                    "phone": phone,
                    "date": booking_date,
                    "time": time_str,
                    "people": payload.seats,
                    "price": price,
                    "status": normalized_status,
                    "referral_code": ref_stored,
                    "bnb_id": bnb_id,
                },
            ).scalar_one()
        )

    new_available = available - payload.seats
    occupied_after = booked + payload.seats
    return booking_id, new_available, capacity, occupied_after, name, payload.seats


def _broadcast_instance_capacity(db: Session, tour_instance_id: int) -> None:
    """Recompute occupied seats from DB and notify dashboards (derived inventory, no `available_seats` column)."""
    capacity_row = db.execute(
        _CAPACITY_SQL,
        {"tour_instance_id": tour_instance_id},
    ).mappings().first()
    booked_row = db.execute(
        _BOOKED_HELD_SQL,
        {"tour_instance_id": tour_instance_id},
    ).mappings().first()
    capacity = int(capacity_row["capacity"] or 0) if capacity_row else 0
    occupied = int(booked_row["booked"] or 0) if booked_row else 0
    manager.broadcast_tour_instance_sync(
        tour_instance_id,
        {
            "type": "capacity_updated",
            "capacity": capacity,
            "occupied": occupied,
        },
    )


def _broadcast_tour_booking(
    tour_instance_id: int,
    booking_id: int,
    name: str,
    seats: int,
    capacity: int,
    occupied_after: int,
    *,
    ws_status: str = "pending",
) -> None:
    manager.broadcast_tour_instance_sync(
        tour_instance_id,
        {
            "type": "booking_created",
            "booking": {
                "id": booking_id,
                "name": name,
                "passengers": seats,
                "status": ws_status,
            },
            "bookings": [
                {
                    "id": booking_id,
                    "name": name,
                    "passengers": seats,
                    "status": ws_status,
                }
            ],
        },
    )
    manager.broadcast_tour_instance_sync(
        tour_instance_id,
        {
            "type": "capacity_updated",
            "capacity": capacity,
            "occupied": occupied_after,
        },
    )


@router.post(
    "/tour-instance",
    response_model=TourInstanceBookingResult,
    status_code=status.HTTP_200_OK,
)
def create_tour_instance_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
) -> TourInstanceBookingResult:
    """Book seats on a tour instance (legacy: immediate confirmed)."""
    company_id = None
    booking_id, new_available, capacity, occupied_after, name, seats = _run_tour_instance_booking(
        db,
        payload,
        company_id=company_id,
        booking_status="confirmed",
    )
    _broadcast_tour_booking(
        payload.tour_instance_id,
        booking_id,
        name,
        seats,
        capacity,
        occupied_after,
        ws_status="confirmed",
    )
    return TourInstanceBookingResult(success=True, available=new_available)


@router.post("/", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking_endpoint(
    payload: BookingCreate,
    db: Session = Depends(get_db),
) -> BookingResponse:
    resolved_company_id = None

    booking_status = _normalize_new_booking_status(payload.status, default="pending")

    booking_id, _, capacity, occupied_after, name, seats = _run_tour_instance_booking(
        db,
        payload,
        company_id=resolved_company_id,
        booking_status=booking_status,
    )

    qr_path: str | None = None

    if booking_status != "pending":
        with db.begin():
            booking = db.query(Booking).filter(Booking.id == booking_id).with_for_update().one()
            if payload.flight_number is not None:
                booking.flight_number = normalize_flight_number(payload.flight_number)
                # Auto-set pickup time from flight ETA (best-effort).
                try:
                    flight = lookup_flight_aviationstack(booking.flight_number)
                    if booking.flight_number and flight and flight.estimated_arrival:
                        buffer_minutes = 20
                        dep_country = (flight.departure_country or "").strip().lower()
                        if dep_country and dep_country not in ("italy", "it"):
                            buffer_minutes = 40
                        eta_utc = flight.estimated_arrival
                        if eta_utc.tzinfo is None:
                            eta_utc = eta_utc.replace(tzinfo=ZoneInfo("UTC"))
                        else:
                            eta_utc = eta_utc.astimezone(ZoneInfo("UTC"))
                        eta_local = eta_utc.astimezone(ZoneInfo("Europe/Rome"))
                        pickup_dt = eta_local + timedelta(minutes=buffer_minutes)

                        pickup_local_naive = pickup_dt.replace(tzinfo=None)
                        booking.pickup_datetime = pickup_local_naive
                        booking.date = pickup_local_naive.date()
                        booking.time = pickup_local_naive.time()
                except Exception as e:
                    print("FLIGHT ETA PICKUP ERROR:", str(e))
            if payload.pickup_latitude is not None:
                booking.pickup_latitude = payload.pickup_latitude
            if payload.pickup_longitude is not None:
                booking.pickup_longitude = payload.pickup_longitude
            if payload.dropoff_latitude is not None:
                booking.dropoff_latitude = payload.dropoff_latitude
            if payload.dropoff_longitude is not None:
                booking.dropoff_longitude = payload.dropoff_longitude
            if payload.driver_id is not None:
                booking.driver_id = payload.driver_id
            if payload.vehicle_id is not None:
                booking.vehicle_id = payload.vehicle_id
            _qr_code, qr_path = generate_booking_qr(booking.id)
            booking.qr_code = _qr_code

        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        db.refresh(booking)
        booking.qr_image_path = qr_path

        send_email(
            to_email=booking.email,
            subject="Booking created",
            body=build_booking_email_body(booking=booking, qr_path=qr_path),
            attachment_path=qr_path,
        )
    else:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        db.refresh(booking)

    _broadcast_tour_booking(
        payload.tour_instance_id,
        booking_id,
        name,
        seats,
        capacity,
        occupied_after,
        ws_status=booking_status,
    )

    return booking


@router.get("/", response_model=list[BookingResponse])
def get_bookings_endpoint(
    db: Session = Depends(get_db),
) -> list[BookingResponse]:
    return get_bookings(db)


@router.get("/{id}", response_model=BookingResponse)
def get_booking_by_id_endpoint(
    id: int,
    db: Session = Depends(get_db),
) -> BookingResponse:
    booking = db.query(Booking).filter(Booking.id == id).first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@router.delete("/{booking_id}", status_code=status.HTTP_200_OK)
def cancel_booking_endpoint(
    booking_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """
    Cancel a booking and free seats on the tour instance.
    Capacity is derived from bookings in HELD_BOOKING_STATUSES; `cancelled` is excluded, so seats are restored.
    Confirmed bookings cannot be cancelled via this endpoint.
    """
    instance_id: int | None = None
    with db.begin():
        booking = (
            db.query(Booking)
            .filter(Booking.id == booking_id)
            .with_for_update()
            .one_or_none()
        )
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        st = str(booking.status or "").strip().lower()
        if st == "confirmed":
            raise HTTPException(
                status_code=400,
                detail="Prenotazione confermata, non cancellabile",
            )
        if st == "cancelled":
            return {
                "success": True,
                "booking_id": booking_id,
                "status": "cancelled",
                "note": "already_cancelled",
            }
        instance_id = (
            int(booking.tour_instance_id) if booking.tour_instance_id is not None else None
        )
        booking.status = "cancelled"

    if instance_id is not None:
        _broadcast_instance_capacity(db, instance_id)

    return {"success": True, "booking_id": booking_id, "status": "cancelled"}


@router.post("/{booking_id}/refund", status_code=status.HTTP_200_OK)
def refund_booking_endpoint(
    booking_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """
    Refund a Stripe-paid booking (tour) and free seats.

    Only bookings in status ``confirmed`` with a Stripe checkout session can be refunded.
    After a successful refund, status is set to ``refunded``.
    """
    import threading

    booking: Booking | None
    instance_id: int | None = None

    with db.begin():
        booking = (
            db.query(Booking)
            .filter(Booking.id == booking_id)
            .with_for_update()
            .one_or_none()
        )
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")

        st = str(booking.status or "").strip().lower()
        if st == "refunded":
            # Idempotent behaviour: a second refund call simply reports success.
            return {
                "success": True,
                "booking_id": booking_id,
                "status": "refunded",
                "note": "Già rimborsato",
            }
        if st not in ("paid", "confirmed"):
            raise HTTPException(
                status_code=400,
                detail="Solo prenotazioni pagate o confermate possono essere rimborsate",
            )

        sid = getattr(booking, "stripe_session_id", None)
        payment_intent_id = getattr(booking, "payment_intent_id", None)

        # Manual refund path: booking not linked to Stripe (no payment intent / session).
        if not sid and not payment_intent_id:
            from app.models.payment import Payment  # local import to avoid cycles

            booking.status = "refunded"
            qs = db.query(Payment).filter(Payment.booking_id == booking.id)
            for p in qs.all():
                p.status = "refunded"
            instance_id = int(booking.tour_instance_id) if booking.tour_instance_id is not None else None
            manual_refund = True
        else:
            manual_refund = False

            if not stripe_service.stripe.api_key:
                raise HTTPException(
                    status_code=503,
                    detail="Stripe non configurato per i rimborsi",
                )

            # Retrieve the Checkout Session to obtain the PaymentIntent id when missing.
            if not payment_intent_id and sid:
                try:
                    session = stripe_service.stripe.checkout.Session.retrieve(sid)
                    payment_intent_id = session.get("payment_intent")
                except Exception as e:  # pragma: no cover - defensive
                    raise HTTPException(
                        status_code=400,
                        detail=f"Impossibile recuperare il pagamento Stripe: {e}",
                    )

            if not payment_intent_id:
                raise HTTPException(
                    status_code=400,
                    detail="Pagamento Stripe non trovato per questa prenotazione",
                )

            try:
                refund = stripe_service.stripe.Refund.create(payment_intent=payment_intent_id)
            except Exception as e:  # pragma: no cover - Stripe errors
                raise HTTPException(
                    status_code=400,
                    detail=f"Rimborso Stripe non riuscito: {e}",
                )

            booking.status = "refunded"
            if not getattr(booking, "payment_intent_id", None):
                booking.payment_intent_id = str(payment_intent_id)
            # Update payment rows linked to this payment intent / booking.
            from app.models.payment import Payment  # local import to avoid cycles

            qs = db.query(Payment).filter(Payment.booking_id == booking.id)
            if payment_intent_id:
                qs = qs.filter(Payment.stripe_payment_intent == str(payment_intent_id))
            refund_id = getattr(refund, "id", None)
            for p in qs.all():
                p.status = "refunded"
                if refund_id and not getattr(p, "stripe_refund_id", None):
                    p.stripe_refund_id = str(refund_id)
            instance_id = int(booking.tour_instance_id) if booking.tour_instance_id is not None else None

    if instance_id is not None:
        _broadcast_instance_capacity(db, instance_id)

    # Fire-and-forget email; do not block refund on SMTP issues.
    try:
        threading.Thread(
            target=send_booking_refunded_email,
            kwargs={"to_email": booking.email, "booking": booking},
            daemon=True,
        ).start()
    except Exception:
        pass

    if manual_refund:
        return {
            "success": True,
            "booking_id": booking_id,
            "status": "refunded",
            "message": "Rimborso manuale (no Stripe)",
        }

    return {"success": True, "booking_id": booking_id, "status": "refunded"}

@router.post("/{booking_id}/pay")
def pay_booking_simulated(
    booking_id: int,
    db: Session = Depends(get_db),
) -> dict:
    # TODO: integrazione Stripe futura — usare Checkout/PaymentIntent + webhook idempotente al posto di questo endpoint.
    with db.begin():
        b = db.query(Booking).filter(Booking.id == booking_id).with_for_update().one_or_none()
        if b is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        st = str(b.status or "").lower()
        if st in ("paid", "confirmed"):
            raise HTTPException(status_code=400, detail="Pagamento già effettuato")
        if st != "pending":
            raise HTTPException(status_code=400, detail="Solo prenotazioni in attesa possono essere pagate")
        if b.tour_instance_id is None:
            raise HTTPException(status_code=400, detail="Prenotazione non collegata a un turno tour")
        b.status = "paid"

    db.refresh(b)
    return {
        "success": True,
        "booking_id": b.id,
        "status": b.status,
        "booking": BookingResponse.model_validate(b),
    }


class CustomRideCreate(BaseModel):
    pickup: str
    destination: str
    date: Date
    time: Time
    price: float | None = None
    email: str


class DraftBookingUpdate(BaseModel):
    # Editable fields on the quote page
    customer_name: str | None = None
    # Alias used by some clients (maps to customer_name)
    passenger_name: str | None = None
    phone: str | None = None
    people: int | None = None
    date: Date | None = None
    time: Time | None = None

    # Prefilled but allowed to update (safe for draft flows)
    pickup: str | None = None
    destination: str | None = None
    flight_number: str | None = None


@router.patch("/{id}", response_model=BookingResponse)
def update_draft_booking(
    id: int,
    payload: DraftBookingUpdate,
    db: Session = Depends(get_db),
) -> BookingResponse:
    booking = db.query(Booking).filter(Booking.id == id).with_for_update().first()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Do not allow editing after payment / confirmation.
    if str(getattr(booking, "status", "")).lower() in ("confirmed", "paid"):
        raise HTTPException(status_code=400, detail="Booking already confirmed")

    if payload.passenger_name is not None and payload.customer_name is None:
        payload.customer_name = payload.passenger_name

    if payload.customer_name is not None:
        booking.customer_name = payload.customer_name.strip() or booking.customer_name
    if payload.phone is not None:
        booking.phone = payload.phone.strip() or booking.phone
    if payload.people is not None:
        if int(payload.people) < 1:
            raise HTTPException(status_code=400, detail="people must be >= 1")
        booking.people = int(payload.people)
    if payload.date is not None:
        booking.date = payload.date
    if payload.time is not None:
        booking.time = payload.time
    if payload.pickup is not None:
        booking.pickup = payload.pickup.strip() or booking.pickup
    if payload.destination is not None:
        booking.destination = payload.destination.strip() or booking.destination
    if payload.flight_number is not None:
        booking.flight_number = normalize_flight_number(payload.flight_number) if payload.flight_number.strip() else None
        # Auto-set pickup time from flight ETA (best-effort).
        try:
            flight = lookup_flight_aviationstack(booking.flight_number) if booking.flight_number else None
            if booking.flight_number and flight and flight.estimated_arrival:
                buffer_minutes = 20
                dep_country = (flight.departure_country or "").strip().lower()
                if dep_country and dep_country not in ("italy", "it"):
                    buffer_minutes = 40
                eta_utc = flight.estimated_arrival
                if eta_utc.tzinfo is None:
                    eta_utc = eta_utc.replace(tzinfo=ZoneInfo("UTC"))
                else:
                    eta_utc = eta_utc.astimezone(ZoneInfo("UTC"))
                eta_local = eta_utc.astimezone(ZoneInfo("Europe/Rome"))
                pickup_dt = eta_local + timedelta(minutes=buffer_minutes)

                pickup_local_naive = pickup_dt.replace(tzinfo=None)
                booking.pickup_datetime = pickup_local_naive
                booking.date = pickup_local_naive.date()
                booking.time = pickup_local_naive.time()
        except Exception as e:
            print("FLIGHT ETA PICKUP ERROR:", str(e))

    db.commit()
    db.refresh(booking)
    return booking


@router.post("/custom-ride", status_code=status.HTTP_201_CREATED)
def create_custom_ride(
    payload: CustomRideCreate,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> dict:
    """
    Create a Quote only (pending). Trip and Booking are created after payment (Stripe or POST /quotes/{id}/pay).

    If ``price`` is omitted, compute it from geocoded coordinates using a simple
    distance-based formula. When auto-pricing is used, the computed distance is
    stored on the Quote as ``distance_km``.
    """
    pickup_text = payload.pickup.strip()
    destination_text = payload.destination.strip()

    auto_price: float | None = None
    distance_km: float | None = None

    if payload.price is None:
        # Best-effort: geocode both ends and auto-price. If anything fails, return 400
        # so the caller can either retry or provide an explicit price.
        g1 = geocode_address(pickup_text)
        g2 = geocode_address(destination_text)
        if not g1 or not g2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossibile calcolare il prezzo automatico per questo percorso",
            )
        (p_lat, p_lng), (d_lat, d_lng) = g1, g2
        auto_price, distance_km = calculate_price(p_lat, p_lng, d_lat, d_lng)

    final_price = float(payload.price) if payload.price is not None else float(auto_price)

    quote = Quote(
        company_id=None,
        status="pending",
        customer_name="Cliente",
        email=payload.email.strip(),
        phone="N/A",
        date=payload.date,
        time=payload.time,
        people=1,
        price=final_price,
        pickup=pickup_text,
        destination=destination_text,
        distance_km=distance_km,
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    quote_url = f"{FRONTEND_URL}/quote/{quote.id}"
    try:
        send_custom_ride_quote_email(to_email=payload.email.strip(), quote=quote, quote_url=quote_url)
    except Exception as e:
        print("QUOTE EMAIL ERROR:", str(e))

    return {
        "quote_id": quote.id,
        "quote_url": quote_url,
        "pay_url": f"/quote/{quote.id}",
    }


@router.get("/{id}/qr")
def get_qr(id: int, db: Session = Depends(get_db)) -> dict:
    booking = db.query(Booking).filter(Booking.id == id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"qr": booking.qr_code}
