from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.modules.identity.security import decode_access_token
from app.token_store import get_token_store


bearer_scheme = HTTPBearer(auto_error=False)
settings = get_settings()


def _token_issued_at(payload: dict) -> float:
    issued_at = payload.get("iat")
    if issued_at is not None:
        return float(issued_at)
    expires_at = payload.get("exp")
    if expires_at is None:
        return 0.0
    return float(expires_at) - (settings.jwt_access_token_expire_minutes * 60)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    token_store=Depends(get_token_store),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    token_jti = payload.get("jti")
    if not token_jti or token_store.exists(f"revoked:{token_jti}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    revoked_before = token_store.get(f"revoked_before:{user_id}") if user_id else None
    if revoked_before and _token_issued_at(payload) < float(revoked_before):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    request.state.current_user = user
    request.state.access_token_payload = payload
    request.state.impersonated_by = payload.get("impersonated_by")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_admin_or_support(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"admin", "support"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or support access required")
    return user
