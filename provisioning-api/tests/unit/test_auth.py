from __future__ import annotations

from datetime import UTC, datetime

from app.models import AuditLog
from app.security import decode_access_token


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
