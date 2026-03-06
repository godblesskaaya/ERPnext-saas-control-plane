from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import bearer_scheme, get_current_user
from app.models import User
from app.rate_limits import (
    login_rate_limit,
    logout_rate_limit,
    refresh_token_rate_limit,
    signup_rate_limit,
)
from app.schemas import LoginRequest, MessageResponse, SignupRequest, TokenResponse, UserOut
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_token_ttl_seconds,
    hash_password,
    verify_password,
)
from app.services.audit_service import record_audit_event
from app.services.notifications import notification_service
from app.token_store import get_token_store


router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.use_secure_cookies,
        samesite="strict",
        max_age=settings.jwt_refresh_token_expire_days * 24 * 60 * 60,
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.refresh_cookie_name, path="/auth")


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(signup_rate_limit)])
def signup(
    request: Request,
    payload: SignupRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> UserOut:
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password), role="user")
    db.add(user)
    db.commit()
    db.refresh(user)
    record_audit_event(
        db,
        action="auth.signup",
        resource="users",
        actor=user,
        resource_id=user.id,
        request=request,
        metadata={"email": user.email},
    )
    background_tasks.add_task(notification_service.send_signup_confirmed, user.email)
    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(login_rate_limit)])
def login(request: Request, response: Response, payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        record_audit_event(
            db,
            action="auth.login_failed",
            resource="users",
            actor=user,
            actor_role=user.role if user else "anonymous",
            resource_id=user.id if user else None,
            request=request,
            metadata={"email": payload.email.lower()},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token(subject=user.id, role=user.role)
    refresh_token = create_refresh_token(subject=user.id, role=user.role)
    _set_refresh_cookie(response, refresh_token)
    record_audit_event(
        db,
        action="auth.login",
        resource="users",
        actor=user,
        resource_id=user.id,
        request=request,
    )
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(refresh_token_rate_limit)])
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db), token_store=Depends(get_token_store)) -> TokenResponse:
    refresh_token_value = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    try:
        payload = decode_refresh_token(refresh_token_value)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    token_jti = payload.get("jti")
    if not token_jti or token_store.exists(f"revoked:{token_jti}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

    user = db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_store.setex(f"revoked:{token_jti}", get_token_ttl_seconds(payload) + 60, "1")
    new_refresh_token = create_refresh_token(subject=user.id, role=user.role)
    access_token = create_access_token(subject=user.id, role=user.role)
    _set_refresh_cookie(response, new_refresh_token)
    return TokenResponse(access_token=access_token)


@router.post("/logout", response_model=MessageResponse, dependencies=[Depends(logout_rate_limit)])
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    token_store=Depends(get_token_store),
) -> MessageResponse:
    payload = getattr(request.state, "access_token_payload", None)
    if credentials is None or payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")

    access_jti = payload.get("jti")
    if access_jti:
        token_store.setex(f"revoked:{access_jti}", get_token_ttl_seconds(payload) + 60, "1")

    refresh_token_value = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token_value:
        try:
            refresh_payload = decode_refresh_token(refresh_token_value)
        except Exception:
            refresh_payload = None
        if refresh_payload and refresh_payload.get("jti"):
            token_store.setex(
                f"revoked:{refresh_payload['jti']}",
                get_token_ttl_seconds(refresh_payload) + 60,
                "1",
            )

    _clear_refresh_cookie(response)
    record_audit_event(
        db,
        action="auth.logout",
        resource="users",
        actor=current_user,
        resource_id=current_user.id,
        request=request,
    )
    return MessageResponse(message="Logged out")
