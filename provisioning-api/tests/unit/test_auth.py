from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime
from unittest.mock import patch

from app.models import AuditLog
from app.security import decode_access_token
from app.token_store import get_token_store


def test_signup_login_refresh_and_logout_revokes_access_token(client, db_session):
    signup = client.post(
        "/auth/signup",
        json={"email": "user@example.com", "password": "Secret123!"},
    )
    assert signup.status_code == 201

    login = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "Secret123!"},
    )
    assert login.status_code == 200
    data = login.json()
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert "refresh_token=" in login.headers["set-cookie"]
    assert "HttpOnly" in login.headers["set-cookie"]

    access_payload = decode_access_token(data["access_token"])
    expires_at = datetime.fromtimestamp(access_payload["exp"], tz=UTC)
    remaining_seconds = (expires_at - datetime.now(UTC)).total_seconds()
    assert 0 < remaining_seconds <= 15 * 60 + 5

    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200
    refreshed_token = refreshed.json()["access_token"]
    assert refreshed_token != data["access_token"]

    logout = client.post("/auth/logout", headers={"Authorization": f"Bearer {refreshed_token}"})
    assert logout.status_code == 200
    assert logout.json()["message"] == "Logged out"

    revoked = client.get("/tenants", headers={"Authorization": f"Bearer {refreshed_token}"})
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == "Token revoked"

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["auth.signup", "auth.login", "auth.logout"]


def test_login_invalid_password_records_audit_log(client, db_session):
    client.post("/auth/signup", json={"email": "user@example.com", "password": "Secret123!"})

    login = client.post("/auth/login", json={"email": "user@example.com", "password": "Wrong1234"})
    assert login.status_code == 401

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["auth.signup", "auth.login_failed"]


@patch("app.routers.auth.secrets.token_urlsafe", return_value="reset-token-for-tests")
def test_forgot_and_reset_password_single_use(mock_token, client, db_session):
    del mock_token
    signup = client.post(
        "/auth/signup",
        json={"email": "recover@example.com", "password": "Secret123!"},
    )
    assert signup.status_code == 201

    first = client.post("/auth/forgot-password", json={"email": "recover@example.com"})
    second = client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()

    key = "password-reset:" + hashlib.sha256("reset-token-for-tests".encode("utf-8")).hexdigest()
    store = get_token_store()
    assert store.exists(key) == 1

    bad = client.post(
        "/auth/reset-password",
        json={"token": "invalid-token-invalid-token", "new_password": "Another123!"},
    )
    assert bad.status_code == 400

    reset = client.post(
        "/auth/reset-password",
        json={"token": "reset-token-for-tests", "new_password": "Another123!"},
    )
    assert reset.status_code == 200
    assert store.exists(key) == 0

    reused = client.post(
        "/auth/reset-password",
        json={"token": "reset-token-for-tests", "new_password": "Another123!"},
    )
    assert reused.status_code == 400

    old_login = client.post("/auth/login", json={"email": "recover@example.com", "password": "Secret123!"})
    new_login = client.post("/auth/login", json={"email": "recover@example.com", "password": "Another123!"})
    assert old_login.status_code == 401
    assert new_login.status_code == 200

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "auth.forgot_password_requested" in actions
    assert "auth.password_reset" in actions


def test_reset_password_expired_token(client):
    client.post("/auth/signup", json={"email": "exp@example.com", "password": "Secret123!"})
    key = "password-reset:" + hashlib.sha256("expired-reset-token-value-123".encode("utf-8")).hexdigest()
    store = get_token_store()
    store.setex(key, 1, "non-existent-user")
    time.sleep(1.1)

    expired = client.post(
        "/auth/reset-password",
        json={"token": "expired-reset-token-value-123", "new_password": "Newpass123!"},
    )
    assert expired.status_code == 400
