"""JWT auth (dev stub) + HMAC session tokens — PRD §3/§10."""

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request

from .config import settings


def make_jwt(user_id: uuid.UUID, handle: str) -> str:
    payload = {
        "sub": str(user_id),
        "handle": handle,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def current_user_id(request: Request) -> uuid.UUID:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        payload = decode_jwt(auth.removeprefix("Bearer "))
        return uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


CurrentUser = Depends(current_user_id)


def session_token(session_id: uuid.UUID, user_id: uuid.UUID, spec_hash: str) -> str:
    msg = f"{session_id}:{user_id}:{spec_hash}".encode()
    return hmac.new(settings.session_token_secret.encode(), msg, hashlib.sha256).hexdigest()


def verify_session_token(
    token: str, session_id: uuid.UUID, user_id: uuid.UUID, spec_hash: str
) -> bool:
    return hmac.compare_digest(token, session_token(session_id, user_id, spec_hash))
