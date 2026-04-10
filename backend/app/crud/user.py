from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserCreate
from app.services.user_passwords import hash_user_password


def get_user_by_email(db: Session, email: str) -> User | None:
    em = (email or "").strip().lower()
    if not em:
        return None
    return db.query(User).filter(func.lower(User.email) == em).first()


def create_user(db: Session, payload: UserCreate) -> User:
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    password = data.pop("password", None)
    data["email"] = (data.get("email") or "").strip().lower()
    user = User(
        email=data["email"],
        password_hash=hash_user_password(password or ""),
        role=data.get("role") or "driver",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
