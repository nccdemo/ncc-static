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
    """Legacy driver JWT: ``sub`` = ``drivers.id``; includes ``driver_id`` claim (no ``user_id``)."""
    did = int(driver_id)
    return create_access_token(
        subject=str(did),
        role="driver",
        extra_claims={"driver_id": did},
    )
