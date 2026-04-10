import bcrypt

from app.services.jwt_auth import create_access_token


def hash_password(password: str) -> str:
    """Bcrypt hash (``bcrypt`` package). Compatible with ``verify_password`` / passlib-verified hashes."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_driver_access_token(driver_id: int, _email: str = "") -> str:
    return create_access_token(subject=str(int(driver_id)), role="driver")
