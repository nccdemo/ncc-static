import os
from datetime import datetime, timedelta, timezone

import jwt

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-driver-jwt-change-in-production")
JWT_ALG = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7


def create_access_token(
    *,
    subject: str,
    role: str,
    extra_claims: dict | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
