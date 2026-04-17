"""Tour gallery: ``tour.images`` is a JSON array of relative URL strings (max 5)."""

from collections.abc import Sequence
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy.orm import Session

from app.models.tour import Tour

_MAX_IMAGES = 5
_MAX_BYTES = 5 * 1024 * 1024


def _unlink_tour_upload_by_url(url: str) -> None:
    if not url or not isinstance(url, str):
        return
    try:
        if not url.startswith("/uploads/tours/"):
            return
        rel = url.removeprefix("/uploads/tours/").lstrip("/")
        if not rel or ".." in rel:
            return
        base_dir = Path(__file__).resolve().parents[2]
        path = base_dir / "uploads" / "tours" / rel
        if path.is_file():
            path.unlink()
    except Exception:
        pass


def _process_single_tour_upload(file: UploadFile) -> str:
    """Read ``file``, validate, resize, save under ``uploads/tours/``; return ``/uploads/tours/{name}``."""
    content_type = (file.content_type or "").lower()
    allowed_types = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only JPEG/PNG/WebP images are allowed.",
        )

    ext = allowed_types[content_type]
    filename = f"{uuid4().hex}{ext}"

    base_dir = Path(__file__).resolve().parents[2]
    uploads_dir = base_dir / "uploads" / "tours"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    dest_path = uploads_dir / filename

    try:
        raw = bytearray()
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            raw.extend(chunk)
            if len(raw) > _MAX_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File too large. Max size is 5MB.",
                )

        try:
            img = Image.open(BytesIO(bytes(raw)))
            img.load()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image file.",
            ) from e

        if ext == ".jpg":
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA") if "A" in img.mode else img.convert("RGB")

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

    return f"/uploads/tours/{filename}"


def append_tour_images_from_upload_files(db: Session, tour: Tour, files: Sequence[UploadFile]) -> dict:
    """
    Append one or more images to ``tour.images`` (relative URLs), enforcing at most
    :data:`_MAX_IMAGES` total. Uses a single DB commit after all files are written.
    """
    file_list = [f for f in files if f is not None]
    if not file_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one image file is required",
        )

    raw = getattr(tour, "images", None) or []
    images: list[str] = [str(u).strip() for u in raw if u is not None and str(u).strip()]

    if len(images) + len(file_list) > _MAX_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Max {_MAX_IMAGES} images per tour (have {len(images)}, tried to add {len(file_list)}).",
        )

    new_urls: list[str] = []
    try:
        for f in file_list:
            new_urls.append(_process_single_tour_upload(f))
    except Exception:
        for url in new_urls:
            _unlink_tour_upload_by_url(url)
        raise

    tour.images = images + new_urls
    db.add(tour)
    db.commit()
    db.refresh(tour)
    return {"images": list(tour.images or [])}


def append_tour_image_from_upload_file(db: Session, tour: Tour, file: UploadFile) -> dict:
    """Backward-compatible single-file upload."""
    return append_tour_images_from_upload_files(db, tour, [file])
