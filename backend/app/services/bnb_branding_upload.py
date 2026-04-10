"""Save B&amp;B partner branding images under ``uploads/bnb/{provider_id}/``."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from PIL import Image


def save_bnb_branding_upload(
    file: UploadFile,
    *,
    provider_id: int,
    max_width: int,
) -> str:
    """
    Validate image, resize, write to disk. Returns a path starting with ``/uploads/bnb/...``.
    """
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
            detail="Tipo file non valido. Usa JPEG, PNG o WebP.",
        )

    ext = allowed_types[content_type]
    filename = f"{uuid4().hex}{ext}"

    base_dir = Path(__file__).resolve().parents[2]  # backend/
    uploads_dir = base_dir / "uploads" / "bnb" / str(int(provider_id))
    uploads_dir.mkdir(parents=True, exist_ok=True)
    dest_path = uploads_dir / filename

    try:
        max_bytes = 5 * 1024 * 1024
        raw = bytearray()
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            raw.extend(chunk)
            if len(raw) > max_bytes:
                raise HTTPException(status_code=400, detail="File troppo grande (max 5MB).")

        try:
            img = Image.open(BytesIO(bytes(raw)))
            img.load()
        except Exception as e:
            raise HTTPException(status_code=400, detail="Immagine non valida.") from e

        if ext == ".jpg":
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA") if "A" in img.mode else img.convert("RGB")

        if img.width and img.width > max_width:
            new_h = int(round(img.height * (max_width / float(img.width))))
            img = img.resize((max_width, max(1, new_h)), Image.LANCZOS)

        save_kwargs: dict = {}
        if ext == ".jpg":
            save_kwargs.update({"format": "JPEG", "quality": 82, "optimize": True})
        elif ext == ".png":
            save_kwargs.update({"format": "PNG", "optimize": True})
        elif ext == ".webp":
            save_kwargs.update({"format": "WEBP", "quality": 82, "method": 6})

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

    rel = f"/uploads/bnb/{int(provider_id)}/{filename}"
    return rel


def save_bnb_logo_png_fixed(file: UploadFile, *, provider_id: int, max_width: int = 520) -> str:
    """
    Save logo as ``uploads/bnb/bnb_{provider_id}.png``. Returns ``/uploads/bnb/bnb_{id}.png``.
    """
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
            detail="Tipo file non valido. Usa JPEG, PNG o WebP.",
        )

    base_dir = Path(__file__).resolve().parents[2]  # backend/
    bnb_dir = base_dir / "uploads" / "bnb"
    bnb_dir.mkdir(parents=True, exist_ok=True)
    dest_path = bnb_dir / f"bnb_{int(provider_id)}.png"
    rel = f"/uploads/bnb/bnb_{int(provider_id)}.png"

    try:
        max_bytes = 5 * 1024 * 1024
        raw = bytearray()
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            raw.extend(chunk)
            if len(raw) > max_bytes:
                raise HTTPException(status_code=400, detail="File troppo grande (max 5MB).")

        try:
            img = Image.open(BytesIO(bytes(raw)))
            img.load()
        except Exception as e:
            raise HTTPException(status_code=400, detail="Immagine non valida.") from e

        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")

        if img.width and img.width > max_width:
            new_h = int(round(img.height * (max_width / float(img.width))))
            img = img.resize((max_width, max(1, new_h)), Image.LANCZOS)

        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        else:
            img = img.convert("RGB")

        img.save(dest_path, format="PNG", optimize=True)
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

    return rel


def save_bnb_cover_png_fixed(file: UploadFile, *, provider_id: int, max_width: int = 1600) -> str:
    """
    Save cover as ``uploads/bnb/bnb_{provider_id}_cover.png``.
    Returns ``/uploads/bnb/bnb_{id}_cover.png``.
    """
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
            detail="Tipo file non valido. Usa JPEG, PNG o WebP.",
        )

    base_dir = Path(__file__).resolve().parents[2]  # backend/
    bnb_dir = base_dir / "uploads" / "bnb"
    bnb_dir.mkdir(parents=True, exist_ok=True)
    dest_path = bnb_dir / f"bnb_{int(provider_id)}_cover.png"
    rel = f"/uploads/bnb/bnb_{int(provider_id)}_cover.png"

    try:
        max_bytes = 8 * 1024 * 1024
        raw = bytearray()
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            raw.extend(chunk)
            if len(raw) > max_bytes:
                raise HTTPException(status_code=400, detail="File troppo grande (max 8MB).")

        try:
            img = Image.open(BytesIO(bytes(raw)))
            img.load()
        except Exception as e:
            raise HTTPException(status_code=400, detail="Immagine non valida.") from e

        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA")

        if img.width and img.width > max_width:
            new_h = int(round(img.height * (max_width / float(img.width))))
            img = img.resize((max_width, max(1, new_h)), Image.LANCZOS)

        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        else:
            img = img.convert("RGB")

        img.save(dest_path, format="PNG", optimize=True)
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

    return rel
