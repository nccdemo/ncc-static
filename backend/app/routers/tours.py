from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from PIL import Image
from io import BytesIO

from app.config import API_PUBLIC_URL
from app.crud.tour import create_tour, get_tours
from app.crud.tour_instance_availability import load_tour_instance_availability
from app.database import get_db
from app.models.booking import Booking
from app.models.tour import Tour
from app.models.tour_instance import TourInstance

from app.schemas.tour import (
    TourCreate,
    TourInstanceAvailabilityResponse,
    TourPublicResponse,
    TourResponse,
)

router = APIRouter(prefix="/tours", tags=["tours"])

_DEFAULT_PUBLIC_IMAGE = "https://picsum.photos/400/200"


def _public_images_list(raw_urls: list[str] | None) -> list[str]:
    """Absolute URLs for client apps; non-empty list (single fallback if none)."""
    out: list[str] = []
    for raw in raw_urls or []:
        if raw is None:
            continue
        s = str(raw).strip()
        if not s:
            continue
        out.append(_public_image_url(s))
    # de-dupe preserving order
    seen: set[str] = set()
    unique = []
    for u in out:
        if u not in seen:
            seen.add(u)
            unique.append(u)
    if not unique:
        return [_DEFAULT_PUBLIC_IMAGE]
    return unique


def _public_image_url(raw: str | None) -> str:
    """
    Client apps load images from the API host (Vite does not proxy /uploads).
    Relative paths become ``API_PUBLIC_URL`` + path; missing values use a public placeholder.
    """
    if raw is None:
        return _DEFAULT_PUBLIC_IMAGE
    s = str(raw).strip()
    if not s:
        return _DEFAULT_PUBLIC_IMAGE
    lower = s.lower()
    if lower.startswith("http://") or lower.startswith("https://"):
        return s
    if s.startswith("/"):
        return f"{API_PUBLIC_URL}{s}"
    return f"{API_PUBLIC_URL}/{s.lstrip('/')}"


@router.get("/public", response_model=list[TourPublicResponse])
def list_public_tours(db: Session = Depends(get_db)) -> list[TourPublicResponse]:
    """
    Public-safe tours listing.
    - Only active tours
    - Instance capacity / booked / available from vehicles×quantity and confirmed bookings (`people`)
    """
    try:
        tours = (
            db.query(Tour)
            .filter(Tour.active.is_(True))
            .order_by(Tour.id.desc())
            .all()
        )
        result: list[dict] = []
        for t in tours:
            raw_list = list(getattr(t, "images", None) or [])
            str_list = [str(u).strip() for u in raw_list if u is not None and str(u).strip()]
            result.append(
                {
                    "id": int(t.id),
                    "title": t.title or "",
                    "description": t.description,
                    "base_price": float(t.price) if t.price is not None else 0.0,
                    "images": _public_images_list(str_list),
                    "city": getattr(t, "city", None),
                    "duration": getattr(t, "duration", None),
                }
            )
        return result
    except Exception as e:
        print("ERROR in /tours/public:", str(e))
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/", response_model=list[TourResponse])
def list_tours(db: Session = Depends(get_db)) -> list[TourResponse]:
    return get_tours(db, only_active=True)


@router.get("/{tour_id}", response_model=TourResponse)
def get_tour(tour_id: int, db: Session = Depends(get_db)) -> Tour:
    tour = db.query(Tour).filter(Tour.id == tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")
    return tour


@router.get("/{tour_id}/bookings")
def get_tour_bookings(tour_id: int, db: Session = Depends(get_db)) -> list[dict]:
    tour = db.query(Tour).filter(Tour.id == tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    bookings = (
        db.query(Booking)
        .filter(Booking.tour_id == tour_id)
        .order_by(Booking.id.desc())
        .all()
    )

    return [
        {
            "id": b.id,
            "name": b.customer_name,
            "passengers": int(b.people),
            "status": "checked_in" if getattr(b, "checked_in", False) else "pending",
        }
        for b in bookings
    ]


@router.get("/{tour_id}/instances", response_model=list[TourInstanceAvailabilityResponse])
def get_tour_instances(
    tour_id: int, db: Session = Depends(get_db)
) -> list[TourInstanceAvailabilityResponse]:
    """
    Public: all instances for a tour with capacity / availability (no authentication).
    """
    tour = db.query(Tour).filter(Tour.id == tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    return load_tour_instance_availability(db, tour_id)


@router.post("/", response_model=TourResponse, status_code=status.HTTP_201_CREATED)
def create_tour_endpoint(
    payload: TourCreate,
    db: Session = Depends(get_db),
    x_role: str = Header(default="driver"),
) -> TourResponse:
    if x_role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return create_tour(db, payload)


@router.put("/{tour_id}", response_model=TourResponse)
def update_tour_endpoint(
    tour_id: int,
    payload: TourCreate,
    db: Session = Depends(get_db),
    x_role: str = Header(default="driver"),
) -> TourResponse:
    if x_role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    tour = db.query(Tour).filter(Tour.id == tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    data = payload.model_dump()
    for k, v in data.items():
        setattr(tour, k, v)
    db.commit()
    db.refresh(tour)
    return tour


@router.delete("/{tour_id}")
def delete_tour_endpoint(
    tour_id: int,
    db: Session = Depends(get_db),
    x_role: str = Header(default="driver"),
) -> dict:
    if x_role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    tour = db.query(Tour).filter(Tour.id == tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    # Collect image paths (new + legacy) safely, even if images is NULL.
    images = list(getattr(tour, "images", None) or [])
    tour.images = images
    images = list(images)

    base_dir = Path(__file__).resolve().parents[2]  # backend/
    uploads_root = base_dir / "uploads"
    static_root = base_dir / "static"

    def _unlink_if_exists(url: str) -> None:
        if not url or not isinstance(url, str):
            return
        try:
            if url.startswith("/uploads/"):
                rel = url.removeprefix("/uploads/").lstrip("/")
                path = uploads_root / rel
            elif url.startswith("/static/"):
                rel = url.removeprefix("/static/").lstrip("/")
                path = static_root / rel
            else:
                return
            if path.is_file():
                path.unlink()
        except Exception as e:
            print("WARN delete_tour: failed to delete file:", url, "err:", str(e))

    try:
        # Detach bookings that reference this tour or its instances (avoid FK violations).
        inst_ids = [int(x) for (x,) in db.query(TourInstance.id).filter(TourInstance.tour_id == tour_id).all()]

        try:
            q = db.query(Booking).filter(Booking.tour_id == tour_id)
            q.update({Booking.tour_id: None}, synchronize_session=False)
            if inst_ids:
                db.query(Booking).filter(Booking.tour_instance_id.in_(inst_ids)).update(
                    {Booking.tour_instance_id: None}, synchronize_session=False
                )
        except Exception as e:
            print("WARN delete_tour: failed to detach bookings:", tour_id, str(e))

        # Remove tour instances (FK may not be ON DELETE CASCADE in existing DBs).
        try:
            db.query(TourInstance).filter(TourInstance.tour_id == tour_id).delete(
                synchronize_session=False
            )
        except Exception as e:
            print("WARN delete_tour: failed to delete tour instances:", tour_id, str(e))

        for u in images:
            _unlink_if_exists(u)

        db.delete(tour)
        db.commit()
        return {"success": True, "deleted_id": tour_id}
    except IntegrityError as e:
        db.rollback()
        print("ERROR delete_tour integrity:", tour_id, str(e))
        raise HTTPException(
            status_code=400,
            detail="Cannot delete tour because related records still exist.",
        ) from e
    except Exception as e:
        db.rollback()
        print("ERROR delete_tour:", tour_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to delete tour") from e


@router.post("/{tour_id}/upload-image")
def upload_tour_image(
    tour_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_role: str = Header(default="driver"),
) -> dict:
    if x_role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    tour = db.query(Tour).filter(Tour.id == tour_id).first()
    if tour is None:
        raise HTTPException(status_code=404, detail="Tour not found")

    content_type = (file.content_type or "").lower()
    allowed_types = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only JPEG/PNG/WebP images are allowed.",
        )

    ext = allowed_types[content_type]
    filename = f"{uuid4().hex}{ext}"

    base_dir = Path(__file__).resolve().parents[2]  # backend/
    uploads_dir = base_dir / "uploads" / "tours"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    # Ensure images is always a list (never None)
    images = list(getattr(tour, "images", None) or [])
    tour.images = images
    if len(images) >= 5:
        raise HTTPException(status_code=400, detail="Max 5 images allowed per tour")

    dest_path = uploads_dir / filename

    try:
        max_bytes = 5 * 1024 * 1024  # 5MB
        raw = bytearray()
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            raw.extend(chunk)
            if len(raw) > max_bytes:
                raise HTTPException(
                    status_code=400,
                    detail="File too large. Max size is 5MB.",
                )

        try:
            img = Image.open(BytesIO(bytes(raw)))
            img.load()
        except Exception as e:
            raise HTTPException(status_code=400, detail="Invalid image file.") from e

        # Ensure consistent mode for saving (avoid palette/alpha issues on JPEG)
        if ext == ".jpg":
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA") if "A" in img.mode else img.convert("RGB")

        # Resize to max width 1200px, keep aspect ratio
        max_w = 1200
        if img.width and img.width > max_w:
            new_h = int(round(img.height * (max_w / float(img.width))))
            img = img.resize((max_w, max(1, new_h)), Image.LANCZOS)

        save_kwargs: dict = {}
        if ext == ".jpg":
            save_kwargs.update({"format": "JPEG", "quality": 80, "optimize": True})
        elif ext == ".png":
            save_kwargs.update({"format": "PNG", "optimize": True})
        elif ext == ".webp":
            save_kwargs.update({"format": "WEBP", "quality": 80, "method": 6})

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest_path, **save_kwargs)
    except HTTPException:
        try:
            if dest_path.exists():
                dest_path.unlink()
        except Exception:
            pass
        raise
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    url = f"/uploads/tours/{filename}"
    images.append(url)
    tour.images = images
    db.commit()
    db.refresh(tour)
    return {"images": list(tour.images or [])}
