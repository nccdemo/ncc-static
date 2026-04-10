from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

import json
from pathlib import Path

from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine, get_db
from app.models import (  # noqa: F401
    availability,
    bnb_commission_transfer,
    booking,
    provider,
    referral_visit,
    driver,
    driver_wallet,
    driver_payout,
    driver_work_log,
    driver_schedule,
    quote,
    service_log,
    tour,
    tour_instance,
    tour_instance_vehicle,
    trip,
    user,
    vehicle,
)
from app.routers.auth import (
    AdminLoginRequest,
    AccessTokenResponse,
    require_users_table_user,
    router as auth_router,
)
from app.routers.admin_dashboard import router as admin_dashboard_router
from app.routers.bnb_dashboard import router as bnb_dashboard_router
from app.routers.bnb_register import router as bnb_register_router
from app.routers.portal_login import router as portal_login_router
from app.routers.availability import router as availability_router
from app.routers.booking_checkout import router as booking_checkout_router
from app.routers.bookings import router as bookings_router
from app.routers.quotes import router as quotes_router
from app.routers.drivers import router as drivers_router
from app.routers.flights import router as flights_router
from app.routers.payments import router as payments_router
from app.routers.payments_tracking import router as payments_tracking_router
from app.routers.qr import router as qr_router
from app.routers.service_sheet import router as service_sheet_router
from app.routers.service_log import router as service_log_router
from app.routers.tours import router as tours_router
from app.routers.trip_router import router as trip_router
from app.routers.websocket_router import router as websocket_router
from app.routers.vehicles import router as vehicles_router
from app.routers.driver_trip import router as driver_trip_router
from app.routers import dispatch
from app.routers.dispatch_router import router as dispatch_router
from app.routers.checkin import router as checkin_router
from app.routers.tracking import router as tracking_router
from app.routers.places_geocoding import router as places_geocoding_router
from app.routers.rides import router as rides_router
from app.routers.stripe_onboard import router as stripe_onboard_router
from app.routers.stripe_webhook import router as stripe_webhook_router
from app.routers.payments_ops import router as payments_ops_router
from app.routers.driver_wallet import router as driver_wallet_router
from app.routers.driver_payouts import router as driver_payouts_router
from app.routers.driver_accounting import router as driver_accounting_router
from app.routers.calendar_router import router as calendar_router
from app.routers.debug import router as debug_router
from app.routers.driver_dashboard import router as driver_dashboard_router
from app.routers import tour_instances
from app.routers.public_tour_instances import router as public_tour_instances_router
from app.routers.tour_booking_checkout import router as tour_booking_checkout_router
from app.routers.referral_tracking import router as referral_tracking_router
from app.middleware.referral_subdomain import ReferralSubdomainMiddleware

app = FastAPI(title="NCC Backend", version="1.0.0", redirect_slashes=True)

_root_login_router = APIRouter(tags=["auth"])


@_root_login_router.post("/login", response_model=AccessTokenResponse)
def login_at_api_root(
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
) -> AccessTokenResponse:
    """``POST /login`` — check ``users`` table; temp fixed token (no JWT)."""
    require_users_table_user(db, payload.email, payload.password)
    return AccessTokenResponse(access_token="testtoken", token_type="bearer")


app.include_router(_root_login_router)
app.include_router(bnb_register_router)
app.include_router(referral_tracking_router, prefix="/api")

from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:5173",  # client app
    "http://localhost:5174",  # driver app
    "http://localhost:5175",  # landing / partner onboarding
    "http://localhost:5178",  # B&B partner portal
    "http://localhost:5176",  # admin-dashboard
    "http://localhost:5191",  # ncc-saas-dashboard (public + admin shell)
    "http://localhost:3000",  # admin
    "http://localhost:5177",  # driver dashboard
    "http://localhost:5180",  # ncc-portal (unified admin + driver)
    # Some browsers/dev setups use 127.0.0.1 instead of localhost
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:5178",
    "http://127.0.0.1:5176",
    "http://127.0.0.1:5191",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5177",
    "http://127.0.0.1:5180",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(ReferralSubdomainMiddleware)

# Static files and uploads (served under API_PUBLIC_URL, e.g. http://localhost:8000/uploads/...)
BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
STATIC_DIR = BASE_DIR / "static"
UPLOADS_DIR = BASE_DIR / "uploads"
(UPLOADS_DIR / "tours").mkdir(parents=True, exist_ok=True)
(UPLOADS_DIR / "bnb").mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
# Serves ``backend/uploads`` at ``/uploads`` (e.g. ``/uploads/bnb/bnb_1.png``).
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

Base.metadata.create_all(bind=engine)

# Lightweight bootstrap for multi-tenant columns on existing DBs.
# SQLAlchemy create_all() does NOT add missing columns.

with engine.begin() as conn:
    # Prevent deadlocks during uvicorn --reload (multiple processes running DDL).
    # Advisory locks are Postgres-only; safely skip for SQLite/others.
    locked = False
    try:
        if engine.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_lock(987654321);"))
            locked = True
    except Exception:
        locked = False

    # Merge legacy tours.image_url into tours.images[], then drop image_url (images-only model).
    try:
        insp = inspect(engine)
        if "tours" in insp.get_table_names():
            tour_cols = {c["name"] for c in insp.get_columns("tours")}
            if "image_url" in tour_cols:
                rows = conn.execute(text("SELECT id, image_url, images FROM tours")).mappings().all()
                for row in rows:
                    tid = int(row["id"])
                    legacy = row["image_url"]
                    raw_imgs = row["images"]
                    imgs: list[str] = []
                    if isinstance(raw_imgs, list):
                        imgs = [str(x).strip() for x in raw_imgs if x is not None and str(x).strip()]
                    elif isinstance(raw_imgs, str) and raw_imgs.strip():
                        try:
                            parsed = json.loads(raw_imgs)
                            if isinstance(parsed, list):
                                imgs = [str(x).strip() for x in parsed if str(x).strip()]
                        except json.JSONDecodeError:
                            imgs = []
                    leg = str(legacy).strip() if legacy is not None else ""
                    if leg and leg not in imgs:
                        imgs.insert(0, leg)
                    dumped = json.dumps(imgs)
                    if engine.dialect.name == "postgresql":
                        conn.execute(
                            text("UPDATE tours SET images = CAST(:images AS jsonb) WHERE id = :id"),
                            {"images": dumped, "id": tid},
                        )
                    else:
                        conn.execute(
                            text("UPDATE tours SET images = :images WHERE id = :id"),
                            {"images": dumped, "id": tid},
                        )
                if engine.dialect.name == "postgresql":
                    conn.execute(text("ALTER TABLE tours DROP COLUMN IF EXISTS image_url"))
                else:
                    try:
                        conn.execute(text("ALTER TABLE tours DROP COLUMN image_url"))
                    except Exception:
                        pass
    except Exception as e:
        print("WARN tour image_url→images migration:", str(e))

    conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS tour_instances (
                  id SERIAL PRIMARY KEY,
                  tour_id INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
                  date DATE NOT NULL,
                  vehicles INTEGER NOT NULL DEFAULT 1,
                  capacity INTEGER NOT NULL DEFAULT 7
                );
                """
            )
        )
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_tour_instances_tour_id ON tour_instances (tour_id);'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_tour_instances_date ON tour_instances (date);'))
    conn.execute(text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS driver_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_tour_instances_driver_id ON tour_instances (driver_id);'))
    conn.execute(
        text("ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS vehicle_ids JSONB NOT NULL DEFAULT '[]'::jsonb;")
    )
    conn.execute(text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS driver_name VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS vehicle_name VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT \'scheduled\';'))
    conn.execute(
        text(
            "UPDATE tour_instances SET status = 'active' "
            "WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('scheduled');"
        )
    )
    if engine.dialect.name == "postgresql":
        conn.execute(
            text("ALTER TABLE tour_instances ALTER COLUMN status SET DEFAULT 'active';")
        )
    conn.execute(
        text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS assigned_driver_ids JSONB NULL;')
    )
    conn.execute(
        text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS available_seats INTEGER NULL;')
    )
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS tour_instance_vehicles (
              id SERIAL PRIMARY KEY,
              tour_instance_id INTEGER NOT NULL REFERENCES tour_instances(id) ON DELETE CASCADE,
              vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
              quantity INTEGER NOT NULL DEFAULT 1
            );
            """
        )
    )
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_tour_instance_vehicles_instance_id ON tour_instance_vehicles (tour_instance_id);'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_tour_instance_vehicles_vehicle_id ON tour_instance_vehicles (vehicle_id);'))
    conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_tour_instance_vehicle_pair'
              ) THEN
                ALTER TABLE tour_instance_vehicles
                ADD CONSTRAINT uq_tour_instance_vehicle_pair UNIQUE (tour_instance_id, vehicle_id);
              END IF;
            END $$;
            """
        )
    )

    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS companies (
              id SERIAL PRIMARY KEY,
              name VARCHAR NOT NULL UNIQUE,
              email VARCHAR NULL,
              phone VARCHAR NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """
        )
    )

    # Add company_id columns if missing (backward-compatible: nullable)
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS company_id INTEGER NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS client_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_bookings_client_id ON bookings (client_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL;'))
    conn.execute(text('UPDATE bookings SET created_at = NOW() WHERE created_at IS NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ALTER COLUMN created_at SET DEFAULT NOW();'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR NULL;'))
    conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ix_bookings_stripe_session_id ON bookings (stripe_session_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_bookings_payment_intent_id ON bookings (payment_intent_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS checked_in BOOLEAN NOT NULL DEFAULT FALSE;'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS tour_instance_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_bookings_tour_instance_id ON bookings (tour_instance_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS pickup VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS destination VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS pickup_datetime TIMESTAMP NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS company_id INTEGER NULL;'))
    conn.execute(text("ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'available';"))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS email VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS password_hash VARCHAR NULL;'))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS signup_status VARCHAR NOT NULL DEFAULT 'legacy';"
        )
    )
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS vehicle_plate_number VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS vehicle_seats INTEGER NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS driver_license_number VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS ncc_license_number VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS insurance_number VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS vehicle_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_drivers_vehicle_id ON drivers (vehicle_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_drivers_stripe_account_id ON drivers (stripe_account_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS drivers ADD COLUMN IF NOT EXISTS user_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_drivers_user_id ON drivers (user_id);'))
    # Enforce one driver profile per user (nullable; multiple NULLs allowed).
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_user_id ON drivers (user_id);"))
    conn.execute(text('ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;'))
    conn.execute(text('ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL;'))
    conn.execute(text('UPDATE users SET created_at = NOW() WHERE created_at IS NULL;'))
    # Enforce uniqueness at DB level (in addition to ORM hints).
    # Cleanup script `app/scripts/cleanup_duplicates.py` should be run before enabling these on existing DBs.
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email);"))
    if engine.dialect.name == "postgresql":
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'drivers_user_id_fkey'
                  ) THEN
                    ALTER TABLE drivers
                    ADD CONSTRAINT drivers_user_id_fkey
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
                  END IF;
                END $$;
                """
            )
        )
    conn.execute(text('ALTER TABLE IF EXISTS vehicles ADD COLUMN IF NOT EXISTS company_id INTEGER NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS vehicles ADD COLUMN IF NOT EXISTS driver_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_vehicles_driver_id ON vehicles (driver_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS vehicles ADD COLUMN IF NOT EXISTS type VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS vehicles ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS company_id INTEGER NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS tour_instance_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_trips_tour_instance_id ON trips (tour_instance_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS service_date DATE NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_trips_service_date ON trips (service_date);'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS pickup VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS destination VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS destination_lat DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS destination_lng DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS tracking_token VARCHAR NULL;'))
    conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ix_trips_tracking_token ON trips (tracking_token);'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS eta TIMESTAMP NULL;'))
    # Trip service metrics (no Alembic: bootstrap missing columns/types)
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS start_km DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS end_km DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS service_start_time TIMESTAMP NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS service_end_time TIMESTAMP NULL;'))
    # If columns already existed as INTEGER in older DBs, widen type on Postgres.
    if engine.dialect.name == "postgresql":
        conn.execute(text('ALTER TABLE IF EXISTS trips ALTER COLUMN start_km TYPE DOUBLE PRECISION USING start_km::double precision;'))
        conn.execute(text('ALTER TABLE IF EXISTS trips ALTER COLUMN end_km TYPE DOUBLE PRECISION USING end_km::double precision;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS passengers INTEGER NOT NULL DEFAULT 1;'))
    conn.execute(text('ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION NULL;'))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS commission_rate DOUBLE PRECISION NOT NULL DEFAULT 0.2;"
        )
    )
    conn.execute(text("ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS base_price DOUBLE PRECISION NULL;"))
    conn.execute(text("ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS final_price DOUBLE PRECISION NULL;"))
    conn.execute(text("ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS bnb_commission DOUBLE PRECISION NULL;"))
    conn.execute(text("ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS platform_commission DOUBLE PRECISION NULL;"))
    conn.execute(text("ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS driver_amount DOUBLE PRECISION NULL;"))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS has_bnb BOOLEAN NOT NULL DEFAULT FALSE;"
        )
    )
    conn.execute(text("ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS base_price DOUBLE PRECISION NULL;"))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS has_bnb BOOLEAN NOT NULL DEFAULT FALSE;"
        )
    )
    conn.execute(text('ALTER TABLE IF EXISTS vehicles ADD COLUMN IF NOT EXISTS plate VARCHAR NULL;'))
    # Enforce unique plate numbers (nullable; multiple NULLs allowed).
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_plate ON vehicles (plate);"))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS trip_id INTEGER NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS bnb_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_bookings_bnb_id ON bookings (bnb_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS referral_code VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR NULL;'))
    conn.execute(
        text('CREATE INDEX IF NOT EXISTS ix_bookings_payment_status ON bookings (payment_status);')
    )
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_bookings_referral_code ON bookings (referral_code);'))
    # B&B public profile fields (for referral landing branding)
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS name VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS logo VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS logo_url VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS cover_url VARCHAR NULL;'))
    try:
        conn.execute(
            text(
                "UPDATE providers SET cover_url = cover_image_url "
                "WHERE cover_url IS NULL AND cover_image_url IS NOT NULL AND TRIM(cover_image_url) <> ''"
            )
        )
    except Exception:
        pass
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS display_name VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS city VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_providers_stripe_account_id ON providers (stripe_account_id);'))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS providers ADD COLUMN IF NOT EXISTS total_earnings DOUBLE PRECISION NOT NULL DEFAULT 0;"
        )
    )
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_providers_referral_code ON providers (referral_code);"))
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS bnb_commission_transfers (
              id SERIAL PRIMARY KEY,
              stripe_payment_intent_id VARCHAR(255) NOT NULL UNIQUE,
              stripe_transfer_id VARCHAR(255) NOT NULL,
              booking_id INTEGER NULL,
              bnb_provider_id INTEGER NOT NULL REFERENCES providers(id),
              amount_cents INTEGER NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """
        )
    )
    conn.execute(
        text(
            'CREATE INDEX IF NOT EXISTS ix_bnb_commission_transfers_booking_id ON bnb_commission_transfers (booking_id);'
        )
    )
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_bookings_trip_id ON bookings (trip_id);'))
    conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'bookings_trip_id_fkey'
              ) THEN
                ALTER TABLE bookings
                ADD CONSTRAINT bookings_trip_id_fkey
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;
              END IF;
            END $$;
            """
        )
    )
    conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'trips_tour_instance_id_fkey'
              ) THEN
                ALTER TABLE trips
                ADD CONSTRAINT trips_tour_instance_id_fkey
                FOREIGN KEY (tour_instance_id) REFERENCES tour_instances(id) ON DELETE SET NULL;
              END IF;
            END $$;
            """
        )
    )
    conn.execute(text('ALTER TABLE IF EXISTS tours ADD COLUMN IF NOT EXISTS city VARCHAR NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS tours ADD COLUMN IF NOT EXISTS duration INTEGER NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS tours ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 7;'))
    conn.execute(text('ALTER TABLE IF EXISTS tours ADD COLUMN IF NOT EXISTS occupied_seats INTEGER NOT NULL DEFAULT 0;'))
    conn.execute(text("ALTER TABLE IF EXISTS tours ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;"))
    conn.execute(text('ALTER TABLE IF EXISTS tours ADD COLUMN IF NOT EXISTS owner_driver_id INTEGER NULL;'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_tours_owner_driver_id ON tours (owner_driver_id);'))
    conn.execute(text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS start_time TIME NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS tour_instances ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL;'))
    conn.execute(text('ALTER TABLE IF EXISTS tours ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL;'))
    if engine.dialect.name == "postgresql":
        conn.execute(
            text(
                "UPDATE tour_instances SET created_at = NOW() WHERE created_at IS NULL;"
            )
        )
        conn.execute(text("UPDATE tours SET created_at = NOW() WHERE created_at IS NULL;"))
    if engine.dialect.name == "postgresql":
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'tours_owner_driver_id_fkey'
                  ) THEN
                    ALTER TABLE tours
                    ADD CONSTRAINT tours_owner_driver_id_fkey
                    FOREIGN KEY (owner_driver_id) REFERENCES drivers(id) ON DELETE SET NULL;
                  END IF;
                END $$;
                """
            )
        )

    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS quotes (
              id SERIAL PRIMARY KEY,
              company_id INTEGER NULL REFERENCES companies(id),
              status VARCHAR NOT NULL DEFAULT 'pending',
              customer_name VARCHAR NOT NULL DEFAULT 'Cliente',
              email VARCHAR NOT NULL,
              phone VARCHAR NOT NULL DEFAULT 'N/A',
              pickup VARCHAR NOT NULL,
              destination VARCHAR NOT NULL,
              date DATE NOT NULL,
              time TIME NOT NULL,
              people INTEGER NOT NULL DEFAULT 1,
              price DOUBLE PRECISION NOT NULL,
              flight_number VARCHAR NULL,
              stripe_session_id VARCHAR NULL,
              booking_id INTEGER NULL REFERENCES bookings(id),
              created_at TIMESTAMP NULL DEFAULT NOW()
            );
            """
        )
    )
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_quotes_stripe_session_id ON quotes (stripe_session_id);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quotes_booking_id ON quotes (booking_id);"))

    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS stripe_webhook_events (
              event_id VARCHAR(255) PRIMARY KEY,
              processed_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """
        )
    )

    # Quotes: optional distance_km (for auto-pricing / analytics).
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS quotes ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION NULL;"
        )
    )

    # Payments: track Stripe payments linked to bookings.
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS payments (
              id SERIAL PRIMARY KEY,
              booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
              amount DOUBLE PRECISION NOT NULL,
              commission_amount DOUBLE PRECISION NULL,
              driver_amount DOUBLE PRECISION NULL,
              status VARCHAR NOT NULL DEFAULT 'paid',
              stripe_payment_intent VARCHAR NULL,
              stripe_refund_id VARCHAR NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payments_booking_id ON payments (booking_id);"))
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_payments_stripe_payment_intent ON payments (stripe_payment_intent);"
        )
    )
    # Ensure stripe_refund_id column exists before creating the index (backward compatible).
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS payments "
            "ADD COLUMN IF NOT EXISTS stripe_refund_id VARCHAR NULL;"
        )
    )
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS payments "
            "ADD COLUMN IF NOT EXISTS ride_id INTEGER NULL;"
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payments_ride_id ON payments (ride_id);"))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS commission_amount DOUBLE PRECISION NULL;"
        )
    )
    conn.execute(
        text("ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS driver_amount DOUBLE PRECISION NULL;")
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_payments_stripe_refund_id ON payments (stripe_refund_id);"
        )
    )
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS platform_amount DOUBLE PRECISION NULL;"
        )
    )
    conn.execute(
        text("ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS bnb_amount DOUBLE PRECISION NULL;")
    )
    conn.execute(
        text("ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS referral_code VARCHAR NULL;")
    )
    conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_payments_referral_code ON payments (referral_code);")
    )
    conn.execute(
        text("ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR NULL;")
    )
    conn.execute(
        text("ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS driver_id INTEGER NULL;")
    )
    conn.execute(
        text("ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS bnb_id INTEGER NULL;")
    )
    conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_stripe_session_id ON payments (stripe_session_id);"
        )
    )
    conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_payments_driver_id ON payments (driver_id);")
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_payments_bnb_id ON payments (bnb_id);"))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS stripe_driver_transfer_id VARCHAR NULL;"
        )
    )
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS stripe_bnb_transfer_id VARCHAR NULL;"
        )
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_payments_stripe_driver_transfer_id ON payments (stripe_driver_transfer_id);"
        )
    )
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_payments_stripe_bnb_transfer_id ON payments (stripe_bnb_transfer_id);"
        )
    )

    # Driver wallets (cash tracking)
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS driver_wallets (
              id SERIAL PRIMARY KEY,
              driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
              balance DOUBLE PRECISION NOT NULL DEFAULT 0,
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """
        )
    )
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_wallets_driver_id ON driver_wallets (driver_id);"))

    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS driver_wallet_transactions (
              id SERIAL PRIMARY KEY,
              driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
              ride_id INTEGER NULL,
              amount DOUBLE PRECISION NOT NULL,
              type VARCHAR NOT NULL,
              note VARCHAR NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              wallet_id INTEGER NULL REFERENCES driver_wallets(id) ON DELETE CASCADE
            );
            """
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_wallet_transactions_driver_id ON driver_wallet_transactions (driver_id);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_wallet_transactions_ride_id ON driver_wallet_transactions (ride_id);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_wallet_transactions_wallet_id ON driver_wallet_transactions (wallet_id);"))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS driver_wallet_transactions ADD COLUMN IF NOT EXISTS note VARCHAR NULL;"
        )
    )

    # Driver card payouts & invoices (Stripe earnings, not cash wallet)
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS driver_payouts (
              id SERIAL PRIMARY KEY,
              driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
              amount DOUBLE PRECISION NOT NULL,
              rides_count INTEGER NOT NULL DEFAULT 0,
              status VARCHAR NOT NULL DEFAULT 'pending',
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              paid_at TIMESTAMP NULL
            );
            """
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_payouts_driver_id ON driver_payouts (driver_id);"))
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS driver_invoices (
              id SERIAL PRIMARY KEY,
              driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
              payout_id INTEGER NULL REFERENCES driver_payouts(id) ON DELETE SET NULL,
              amount DOUBLE PRECISION NOT NULL,
              date DATE NOT NULL DEFAULT CURRENT_DATE,
              invoice_number VARCHAR NOT NULL UNIQUE
            );
            """
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_invoices_driver_id ON driver_invoices (driver_id);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_invoices_payout_id ON driver_invoices (payout_id);"))
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS payout_status VARCHAR NOT NULL DEFAULT 'none';"
        )
    )
    conn.execute(
        text(
            "ALTER TABLE IF EXISTS trips ADD COLUMN IF NOT EXISTS driver_payout_id INTEGER NULL REFERENCES driver_payouts(id) ON DELETE SET NULL;"
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_trips_driver_payout_id ON trips (driver_payout_id);"))

    # Driver work logs (working days accounting)
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS driver_work_logs (
              id SERIAL PRIMARY KEY,
              driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
              date DATE NOT NULL,
              rides_count INTEGER NOT NULL DEFAULT 0,
              total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
              created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_work_logs_driver_id ON driver_work_logs (driver_id);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_work_logs_date ON driver_work_logs (date);"))
    # Unique by (driver_id, date) for upserts without Alembic.
    if engine.dialect.name == "postgresql":
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_driver_work_logs_driver_date'
                  ) THEN
                    ALTER TABLE driver_work_logs
                    ADD CONSTRAINT uq_driver_work_logs_driver_date UNIQUE (driver_id, date);
                  END IF;
                END $$;
                """
            )
        )

    # Driver schedule (calendar)
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS driver_schedules (
              id SERIAL PRIMARY KEY,
              driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
              trip_id INTEGER NULL REFERENCES trips(id) ON DELETE SET NULL,
              tour_instance_id INTEGER NULL REFERENCES tour_instances(id) ON DELETE SET NULL,
              date DATE NOT NULL,
              start_time TIME NULL,
              end_time TIME NULL,
              status VARCHAR NOT NULL DEFAULT 'assigned'
            );
            """
        )
    )
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_schedules_driver_id ON driver_schedules (driver_id);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_schedules_date ON driver_schedules (date);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_driver_schedules_trip_id ON driver_schedules (trip_id);"))
    conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_driver_schedules_tour_instance_id ON driver_schedules (tour_instance_id);"
        )
    )

    if locked:
        try:
            conn.execute(text("SELECT pg_advisory_unlock(987654321);"))
        except Exception:
            pass


def _bootstrap_admin_if_configured() -> None:
    import os

    from app.models.user import User
    from app.services.user_passwords import hash_user_password

    pw = (os.getenv("INITIAL_ADMIN_PASSWORD") or "").strip()
    if not pw:
        return
    email = (os.getenv("INITIAL_ADMIN_EMAIL") or "admin@localhost").strip().lower()
    db = SessionLocal()
    try:
        existing = db.query(User).filter(func.lower(User.email) == email).first()
        if existing is not None:
            return
        db.add(
            User(
                email=email,
                password_hash=hash_user_password(pw),
                role="admin",
                is_active=True,
            )
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        print("INITIAL_ADMIN bootstrap skipped:", exc)
    finally:
        db.close()


_bootstrap_admin_if_configured()

app.include_router(auth_router, prefix="/api")
app.include_router(portal_login_router, prefix="/api")
app.include_router(admin_dashboard_router, prefix="/api")
# B&B dashboard router: mount at ``/api/bnb`` (routes in the module are paths like ``/upload-logo``, ``/partner/me`` — no extra ``/bnb`` segment on the router).
app.include_router(bnb_dashboard_router, prefix="/api/bnb")
app.include_router(bookings_router, prefix="/api")
app.include_router(booking_checkout_router, prefix="/api")
app.include_router(quotes_router, prefix="/api")
app.include_router(tours_router, prefix="/api")
app.include_router(public_tour_instances_router, prefix="/api")
app.include_router(driver_dashboard_router, prefix="/api")
app.include_router(drivers_router, prefix="/api")
app.include_router(flights_router, prefix="/api")
app.include_router(vehicles_router, prefix="/api")
app.include_router(availability_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(stripe_onboard_router, prefix="/api")
app.include_router(stripe_webhook_router)
app.include_router(payments_tracking_router, prefix="/api")
app.include_router(checkin_router, prefix="/api")
app.include_router(qr_router, prefix="/api")
app.include_router(tour_instances.router, prefix="/api")
app.include_router(tour_booking_checkout_router, prefix="/api")
app.include_router(service_log_router, prefix="/api")
app.include_router(service_sheet_router, prefix="/api")
app.include_router(trip_router, prefix="/api")
app.include_router(driver_trip_router, prefix="/api")
app.include_router(dispatch.router)
app.include_router(dispatch_router, prefix="/api")
app.include_router(tracking_router, prefix="/api")
app.include_router(places_geocoding_router, prefix="/api")
app.include_router(rides_router, prefix="/api")
app.include_router(payments_ops_router, prefix="/api")
app.include_router(driver_wallet_router, prefix="/api")
app.include_router(driver_payouts_router, prefix="/api")
app.include_router(driver_accounting_router, prefix="/api")
app.include_router(calendar_router, prefix="/api")
app.include_router(debug_router, prefix="/api")
# Also expose dispatch routes without /api for compatibility with clients using /dispatch/*
app.include_router(dispatch_router)
app.include_router(driver_trip_router)
app.include_router(websocket_router)


@app.get("/")
def healthcheck() -> dict:
    return {"message": "NCC Backend is running"}


@app.get("/test-pdf")
def test_pdf():
    from reportlab.platypus import SimpleDocTemplate, Paragraph
    from reportlab.lib.styles import getSampleStyleSheet
    from fastapi.responses import Response
    from io import BytesIO

    buffer = BytesIO()

    doc = SimpleDocTemplate(buffer)
    styles = getSampleStyleSheet()

    elements = []
    elements.append(Paragraph("TEST PDF OK", styles["Title"]))

    doc.build(elements)

    pdf = buffer.getvalue()

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=test.pdf"
        }
    )
