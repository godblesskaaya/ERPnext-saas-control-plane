from __future__ import annotations

import hashlib
import json
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import bearer_scheme, get_current_user
from app.models import User
from app.rate_limits import (
    authenticated_default_rate_limit,
    forgot_password_rate_limit,
    impersonation_exchange_rate_limit,
    login_rate_limit,
    logout_rate_limit,
    resend_verification_rate_limit,
    reset_password_rate_limit,
    refresh_token_rate_limit,
    signup_rate_limit,
)
from app.schemas import (
    ForgotPasswordRequest,
    ImpersonationExchangeRequest,
    LoginRequest,
    MessageResponse,
    ProfileUpdateRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UserOut,
    VerifyEmailRequest,
)
from app.modules.identity.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_token_ttl_seconds,
    hash_password,
    verify_password,
)
from app.utils.time import utcnow
from app.modules.audit.service import record_audit_event
from app.modules.notifications.service import notification_service
from app.token_store import get_token_store


router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

AUTH_401_RESPONSE = {"description": "Unauthorized: missing, invalid, or revoked credentials/token."}
RATE_LIMIT_429_RESPONSE = {"description": "Too many requests. Retry after the rate-limit window."}
VALIDATION_422_RESPONSE = {"description": "Request validation failed."}
CONFLICT_409_RESPONSE = {"description": "Conflict with existing resource state."}


def _password_reset_token_key(raw_token: str) -> str:
    digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return f"password-reset:{digest}"


def _email_verification_token_key(raw_token: str) -> str:
    digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return f"email-verify:{digest}"


def _impersonation_token_key(raw_token: str) -> str:
    digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return f"impersonation:{digest}"


def _consume_single_use_token(token_store, token_key: str) -> str | None:
    getdel = getattr(token_store, "getdel", None)
    if callable(getdel):
        return getdel(token_key)

    value = token_store.get(token_key)
    if value:
        token_store.delete(token_key)
    return value


def _queue_email_verification(
    *,
    user: User,
    token_store,
    background_tasks: BackgroundTasks,
) -> None:
    verification_token = secrets.token_urlsafe(32)
    token_store.setex(
        _email_verification_token_key(verification_token),
        settings.email_verification_token_expire_hours * 60 * 60,
        user.id,
    )
    background_tasks.add_task(
        notification_service.send_email_verification,
        user.email,
        verification_token,
        f"{settings.email_verification_url_base}?token={verification_token}",
        user.phone,
    )


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


@router.post(
    "/signup",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(signup_rate_limit)],
    responses={
        status.HTTP_409_CONFLICT: CONFLICT_409_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def signup(
    request: Request,
    payload: SignupRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    token_store=Depends(get_token_store),
) -> UserOut:
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user = User(email=payload.email.lower(), phone=payload.phone, password_hash=hash_password(payload.password), role="user")
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
        metadata={"email": user.email, "email_verified": user.email_verified},
    )
    _queue_email_verification(
        user=user,
        token_store=token_store,
        background_tasks=background_tasks,
    )
    return UserOut.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(login_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
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


@router.get(
    "/health",
    response_model=MessageResponse,
)
def auth_health(request: Request, db: Session = Depends(get_db)) -> MessageResponse:
    record_audit_event(
        db,
        action="auth.health_check",
        resource="auth",
        actor_role="system",
        request=request,
    )
    return MessageResponse(message="ok")


@router.get(
    "/me",
    response_model=UserOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserOut,
    dependencies=[Depends(authenticated_default_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def update_me(
    request: Request,
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    normalized_phone = payload.phone.strip() if isinstance(payload.phone, str) else None
    if normalized_phone == "":
        normalized_phone = None

    current_user.phone = normalized_phone
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    record_audit_event(
        db,
        action="auth.profile_updated",
        resource="users",
        actor=current_user,
        resource_id=current_user.id,
        request=request,
        metadata={"updated_fields": ["phone"]},
    )
    return UserOut.model_validate(current_user)


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid, expired, or already-used verification token."},
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
    },
)
def verify_email(
    request: Request,
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
    token_store=Depends(get_token_store),
) -> MessageResponse:
    user_id = _consume_single_use_token(token_store, _email_verification_token_key(payload.token))
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token is invalid or expired")

    user = db.get(User, str(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token is invalid or expired")

    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = utcnow()
        db.add(user)
        db.commit()

    record_audit_event(
        db,
        action="auth.email_verified",
        resource="users",
        actor=user,
        resource_id=user.id,
        request=request,
    )
    return MessageResponse(message="Email verified successfully. You can now create a workspace.")


@router.post(
    "/impersonate",
    response_model=TokenResponse,
    dependencies=[Depends(impersonation_exchange_rate_limit)],
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid, expired, or already-used impersonation token."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
    },
)
def exchange_impersonation_token(
    request: Request,
    payload: ImpersonationExchangeRequest,
    db: Session = Depends(get_db),
    token_store=Depends(get_token_store),
) -> TokenResponse:
    token_payload_raw = _consume_single_use_token(token_store, _impersonation_token_key(payload.token))
    if not token_payload_raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impersonation token is invalid or expired")

    try:
        token_payload = json.loads(str(token_payload_raw))
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impersonation token is invalid") from exc

    target_user_id = str(token_payload.get("target_user_id") or "")
    admin_user_id = str(token_payload.get("admin_user_id") or "")
    reason = str(token_payload.get("reason") or "").strip()
    if not target_user_id or not admin_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impersonation token is invalid")

    target_user = db.get(User, target_user_id)
    admin_user = db.get(User, admin_user_id)
    if not target_user or not admin_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Impersonation token is invalid")

    access_token = create_access_token(
        subject=target_user.id,
        role=target_user.role,
        extra_claims={"impersonated_by": admin_user.id},
    )
    record_audit_event(
        db,
        action="auth.impersonation_consumed",
        resource="users",
        actor=target_user,
        resource_id=target_user.id,
        request=request,
        metadata={"impersonated_by": admin_user.id, "reason": reason},
    )
    record_audit_event(
        db,
        action="admin.impersonation_session_issued",
        resource="users",
        actor=admin_user,
        resource_id=target_user.id,
        request=request,
        metadata={"target_user_id": target_user.id, "reason": reason},
    )
    return TokenResponse(access_token=access_token)


@router.get(
    "/resend-verification",
    response_model=MessageResponse,
    dependencies=[Depends(resend_verification_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
def resend_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_store=Depends(get_token_store),
) -> MessageResponse:
    if current_user.email_verified:
        return MessageResponse(message="Email is already verified.")

    _queue_email_verification(
        user=current_user,
        token_store=token_store,
        background_tasks=background_tasks,
    )
    record_audit_event(
        db,
        action="auth.email_verification_resent",
        resource="users",
        actor=current_user,
        resource_id=current_user.id,
        request=request,
    )
    return MessageResponse(message="Verification email sent. Please check your inbox.")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    dependencies=[Depends(forgot_password_rate_limit)],
    responses={
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
    },
)
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    token_store=Depends(get_token_store),
) -> MessageResponse:
    normalized_email = payload.email.lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if user:
        raw_token = secrets.token_urlsafe(32)
        token_store.setex(
            _password_reset_token_key(raw_token),
            settings.password_reset_token_expire_minutes * 60,
            user.id,
        )
        record_audit_event(
            db,
            action="auth.forgot_password_requested",
            resource="users",
            actor=user,
            resource_id=user.id,
            request=request,
        )
        background_tasks.add_task(
            notification_service.send_password_reset_requested,
            normalized_email,
            raw_token,
            f"{settings.password_reset_url_base}?token={raw_token}",
            user.phone,
        )
    else:
        record_audit_event(
            db,
            action="auth.forgot_password_requested",
            resource="users",
            actor_role="anonymous",
            request=request,
            metadata={"email": normalized_email, "user_found": False},
        )

    return MessageResponse(message="If the account exists, password reset instructions have been sent.")


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    dependencies=[Depends(reset_password_rate_limit)],
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid, expired, or already-used reset token."},
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
        status.HTTP_422_UNPROCESSABLE_ENTITY: VALIDATION_422_RESPONSE,
    },
)
def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    token_store=Depends(get_token_store),
) -> MessageResponse:
    token_key = _password_reset_token_key(payload.token)
    user_id: str | None = _consume_single_use_token(token_store, token_key)

    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token is invalid or expired")

    user = db.get(User, str(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token is invalid or expired")

    user.password_hash = hash_password(payload.new_password)
    db.add(user)
    db.commit()
    record_audit_event(
        db,
        action="auth.password_reset",
        resource="users",
        actor=user,
        resource_id=user.id,
        request=request,
    )

    return MessageResponse(message="Password reset successful. You can now sign in.")


@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(refresh_token_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
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


@router.post(
    "/logout",
    response_model=MessageResponse,
    dependencies=[Depends(logout_rate_limit)],
    responses={
        status.HTTP_401_UNAUTHORIZED: AUTH_401_RESPONSE,
        status.HTTP_429_TOO_MANY_REQUESTS: RATE_LIMIT_429_RESPONSE,
    },
)
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
