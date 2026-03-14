from __future__ import annotations

from fastapi import Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings
from app.security import decode_access_token, decode_refresh_token


settings = get_settings()
limiter = Limiter(key_func=get_remote_address, storage_uri=settings.resolved_rate_limit_storage_url, headers_enabled=True)


def _authorization_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def user_rate_limit_key(request: Request) -> str:
    token = _authorization_token(request)
    if token:
        try:
            payload = decode_access_token(token)
        except Exception:
            payload = None
        else:
            subject = payload.get("sub")
            if subject:
                return f"user:{subject}"

    return f"ip:{get_remote_address(request) or 'unknown'}"


def refresh_rate_limit_key(request: Request) -> str:
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token:
        try:
            payload = decode_refresh_token(refresh_token)
        except Exception:
            payload = None
        else:
            subject = payload.get("sub")
            if subject:
                return f"user:{subject}"

    return f"ip:{get_remote_address(request) or 'unknown'}"


def tenant_rate_limit_key(request: Request) -> str:
    tenant_id = request.path_params.get("tenant_id") or "unknown"
    return f"tenant:{tenant_id}"


def _build_limit_dependency(name: str, limit_value: str, key_func=None):
    def marker(request: Request) -> None:
        return None

    marker.__name__ = name
    limited_marker = limiter.limit(limit_value, key_func=key_func)(marker)

    def dependency(request: Request, response: Response) -> None:
        limiter._check_request_limit(request, limited_marker, False)
        limiter._inject_headers(response, request.state.view_rate_limit)

    dependency.__name__ = f"{name}_dependency"
    return dependency


signup_rate_limit = _build_limit_dependency("signup_rate_limit", "5/minute")
login_rate_limit = _build_limit_dependency("login_rate_limit", "10/minute")
resend_verification_rate_limit = _build_limit_dependency("resend_verification_rate_limit", "3/hour", user_rate_limit_key)
forgot_password_rate_limit = _build_limit_dependency("forgot_password_rate_limit", "5/minute")
reset_password_rate_limit = _build_limit_dependency("reset_password_rate_limit", "10/minute")
refresh_token_rate_limit = _build_limit_dependency("refresh_token_rate_limit", "60/minute", refresh_rate_limit_key)
logout_rate_limit = _build_limit_dependency("logout_rate_limit", "60/minute", user_rate_limit_key)
tenant_create_rate_limit = _build_limit_dependency("tenant_create_rate_limit", "3/minute", user_rate_limit_key)
tenant_backup_rate_limit = _build_limit_dependency("tenant_backup_rate_limit", "1/5 minutes", tenant_rate_limit_key)
authenticated_default_rate_limit = _build_limit_dependency(
    "authenticated_default_rate_limit",
    "60/minute",
    user_rate_limit_key,
)
