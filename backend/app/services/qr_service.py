from pathlib import Path
from uuid import uuid4

import qrcode

BASE_STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"
QR_STORAGE_DIR = BASE_STORAGE_DIR / "qr"


def generate_booking_qr(booking_id: int) -> tuple[str, str]:
    """
    Generate a unique QR code value and persist a local QR image.
    Returns: (qr_code, image_path)
    """
    QR_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    qr_code = f"NCC-BOOKING-{booking_id}-{uuid4().hex[:10]}"
    image_path = QR_STORAGE_DIR / f"booking_{booking_id}_{uuid4().hex[:8]}.png"

    qr_img = qrcode.make(qr_code)
    qr_img.save(image_path)

    return qr_code, str(image_path)
