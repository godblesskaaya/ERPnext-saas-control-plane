from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import patch

from app.models import AuditLog, User
from app.modules.identity.security import decode_access_token
from app.token_store import get_token_store

SUPPORT_ADMIN_ROUTER_MODULE = import_module("app.modules.support.admin_router").list_all_tenants.__module__


class LegacyAtomicTokenStore:
    def __init__(self) -> None:
        self._items: dict[str, str] = {}

    def set(self, key: str, value: str) -> None:
        self._items[key] = value

    def eval(self, script: str, numkeys: int, key: str) -> str | None:
        assert numkeys == 1
        assert "redis.call('GET'" in script
        value = self._items.get(key)
        self._items.pop(key, None)
        return value


def test_consume_single_use_token_is_atomic_for_legacy_store() -> None:
    from app.modules.identity.router import _consume_single_use_token

    store = LegacyAtomicTokenStore()
    store.set("single-use-key", "payload-123")

    assert _consume_single_use_token(store, "single-use-key") == "payload-123"
    assert _consume_single_use_token(store, "single-use-key") is None


def test_signup_login_refresh_and_logout_revokes_access_token(client, db_session):
    signup = client.post(
        "/auth/signup",
        json={"email": "user@example.com", "password": "Secret123!"},
    )
    assert signup.status_code == 201
    assert signup.json()["email_verified"] is False
    assert signup.json()["email_verified_at"] is None

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


def test_signup_accepts_optional_phone(client, db_session):
    signup = client.post(
        "/auth/signup",
        json={"email": "phone@example.com", "password": "Secret123!", "phone": "+255700000000"},
    )
    assert signup.status_code == 201
    assert signup.json()["phone"] == "+255700000000"

    user = db_session.query(User).filter(User.email == "phone@example.com").one()
    assert user.phone == "+255700000000"


def test_signup_duplicate_returns_created_without_second_verification_email(client, db_session):
    first = client.post(
        "/auth/signup",
        json={"email": "duplicate@example.com", "password": "Secret123!"},
    )
    assert first.status_code == 201

    second = client.post(
        "/auth/signup",
        json={"email": "duplicate@example.com", "password": "Secret123!"},
    )
    assert second.status_code == 201
    assert second.json()["email"] == "duplicate@example.com"
    assert db_session.query(User).filter(User.email == "duplicate@example.com").count() == 1

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["auth.signup", "auth.signup_duplicate"]


@patch("app.modules.identity.router.secrets.token_urlsafe", side_effect=["email-verify-token-1234567890"])
def test_verify_email_and_me_endpoint(mock_token, client):
    del mock_token
    signup = client.post("/auth/signup", json={"email": "verify@example.com", "password": "Secret123!"})
    assert signup.status_code == 201

    verify_key = "email-verify:" + hashlib.sha256("email-verify-token-1234567890".encode("utf-8")).hexdigest()
    store = get_token_store()
    assert store.exists(verify_key) == 1

    invalid = client.post("/auth/verify-email", json={"token": "invalid-email-token-value-123"})
    assert invalid.status_code == 400

    verified = client.post("/auth/verify-email", json={"token": "email-verify-token-1234567890"})
    assert verified.status_code == 200
    assert "verified" in verified.json()["message"].lower()
    assert store.exists(verify_key) == 0

    reused = client.post("/auth/verify-email", json={"token": "email-verify-token-1234567890"})
    assert reused.status_code == 400

    login = client.post("/auth/login", json={"email": "verify@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email_verified"] is True
    assert me.json()["email_verified_at"] is not None


def test_logout_all_revokes_existing_access_tokens(client):
    signup = client.post("/auth/signup", json={"email": "all-sessions@example.com", "password": "Secret123!"})
    assert signup.status_code == 201

    first_login = client.post("/auth/login", json={"email": "all-sessions@example.com", "password": "Secret123!"})
    second_login = client.post("/auth/login", json={"email": "all-sessions@example.com", "password": "Secret123!"})
    first_token = first_login.json()["access_token"]
    second_token = second_login.json()["access_token"]

    logout_all = client.post("/auth/logout-all", headers={"Authorization": f"Bearer {first_token}"})
    assert logout_all.status_code == 200
    assert logout_all.json()["message"] == "Logged out all sessions"

    revoked = client.get("/auth/me", headers={"Authorization": f"Bearer {second_token}"})
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == "Session revoked"


def test_update_me_phone_and_clear_phone(client, db_session):
    signup = client.post(
        "/auth/signup",
        json={"email": "profile@example.com", "password": "Secret123!", "phone": "+255700000000"},
    )
    assert signup.status_code == 201
    assert signup.json()["phone"] == "+255700000000"

    login = client.post("/auth/login", json={"email": "profile@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    updated = client.patch("/auth/me", headers=headers, json={"phone": " +255755111222 "})
    assert updated.status_code == 200
    assert updated.json()["phone"] == "+255755111222"

    cleared = client.patch("/auth/me", headers=headers, json={"phone": ""})
    assert cleared.status_code == 200
    assert cleared.json()["phone"] is None

    user = db_session.query(User).filter(User.email == "profile@example.com").one()
    assert user.phone is None

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "auth.profile_updated" in actions


def test_notification_preferences_defaults_and_alias_get_paths(client):
    signup = client.post(
        "/auth/signup",
        json={"email": "prefs-get@example.com", "password": "Secret123!"},
    )
    assert signup.status_code == 201

    login = client.post("/auth/login", json={"email": "prefs-get@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    expected = {
        "email_alerts": True,
        "sms_alerts": True,
        "billing_alerts": True,
        "provisioning_alerts": True,
        "support_alerts": True,
    }

    canonical = client.get("/auth/me/preferences", headers=headers)
    assert canonical.status_code == 200
    assert canonical.json() == expected

    primary = client.get("/auth/me/notification-preferences", headers=headers)
    assert primary.status_code == 200
    assert primary.json() == expected

    compatibility = client.get("/auth/me/preferences/notifications", headers=headers)
    assert compatibility.status_code == 200
    assert compatibility.json() == expected


def test_notification_preferences_patch_persists_and_does_not_affect_phone(client, db_session):
    signup = client.post(
        "/auth/signup",
        json={"email": "prefs-patch@example.com", "password": "Secret123!", "phone": "+255700000000"},
    )
    assert signup.status_code == 201

    login = client.post("/auth/login", json={"email": "prefs-patch@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    updated = client.patch(
        "/auth/me/preferences",
        headers=headers,
        json={"sms_alerts": False, "support_alerts": False},
    )
    assert updated.status_code == 200
    assert updated.json() == {
        "email_alerts": True,
        "sms_alerts": False,
        "billing_alerts": True,
        "provisioning_alerts": True,
        "support_alerts": False,
    }

    fetch_primary = client.get("/auth/me/notification-preferences", headers=headers)
    assert fetch_primary.status_code == 200
    assert fetch_primary.json()["sms_alerts"] is False
    assert fetch_primary.json()["support_alerts"] is False

    fetch_compat = client.get("/auth/me/preferences/notifications", headers=headers)
    assert fetch_compat.status_code == 200
    assert fetch_compat.json()["sms_alerts"] is False
    assert fetch_compat.json()["support_alerts"] is False

    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["phone"] == "+255700000000"

    user = db_session.query(User).filter(User.email == "prefs-patch@example.com").one()
    assert user.phone == "+255700000000"
    assert user.notification_email_alerts is True
    assert user.notification_sms_alerts is False
    assert user.notification_billing_alerts is True
    assert user.notification_provisioning_alerts is True
    assert user.notification_support_alerts is False

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "auth.notification_preferences_updated" in actions


@patch(
    "app.modules.identity.router.secrets.token_urlsafe",
    side_effect=["signup-verify-token-123456789", "resend-verify-token-123456789"],
)
def test_resend_verification_flow(mock_token, client, db_session):
    del mock_token
    signup = client.post("/auth/signup", json={"email": "resend@example.com", "password": "Secret123!"})
    assert signup.status_code == 201

    login = client.post("/auth/login", json={"email": "resend@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resend = client.get("/auth/resend-verification", headers=headers)
    assert resend.status_code == 200
    assert "verification" in resend.json()["message"].lower()

    resend_key = "email-verify:" + hashlib.sha256("resend-verify-token-123456789".encode("utf-8")).hexdigest()
    store = get_token_store()
    assert store.exists(resend_key) == 1

    verify = client.post("/auth/verify-email", json={"token": "resend-verify-token-123456789"})
    assert verify.status_code == 200

    already = client.get("/auth/resend-verification", headers=headers)
    assert already.status_code == 200
    assert "already verified" in already.json()["message"].lower()

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "auth.email_verification_resent" in actions
    assert "auth.email_verified" in actions


def test_login_invalid_password_records_audit_log(client, db_session):
    client.post("/auth/signup", json={"email": "user@example.com", "password": "Secret123!"})

    login = client.post("/auth/login", json={"email": "user@example.com", "password": "Wrong1234"})
    assert login.status_code == 401

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["auth.signup", "auth.login_failed"]


@patch("app.modules.identity.router.secrets.token_urlsafe", return_value="reset-token-for-tests")
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


def test_impersonation_exchange_rejects_invalid_token(client):
    response = client.post("/auth/impersonate", json={"token": "invalid-impersonation-token-value-123"})
    assert response.status_code == 400


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.secrets.token_urlsafe", return_value="impersonation-token-for-tests")
def test_admin_can_issue_and_consume_impersonation_link(mock_token, client, db_session):
    del mock_token
    client.post("/auth/signup", json={"email": "admin-imp@example.com", "password": "Secret123!"})
    client.post("/auth/signup", json={"email": "target-imp@example.com", "password": "Secret123!"})

    admin = db_session.query(User).filter(User.email == "admin-imp@example.com").one()
    admin.role = "admin"
    target = db_session.query(User).filter(User.email == "target-imp@example.com").one()
    db_session.add_all([admin, target])
    db_session.commit()

    admin_login = client.post("/auth/login", json={"email": "admin-imp@example.com", "password": "Secret123!"})
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    issued = client.post(
        "/admin/impersonation-links",
        headers=admin_headers,
        json={"target_email": "target-imp@example.com", "reason": "Investigate provisioning issue"},
    )
    assert issued.status_code == 200
    payload = issued.json()
    assert payload["target_email"] == "target-imp@example.com"
    assert payload["token"] == "impersonation-token-for-tests"
    assert "token=impersonation-token-for-tests" in payload["url"]

    store = get_token_store()
    key = "impersonation:" + hashlib.sha256("impersonation-token-for-tests".encode("utf-8")).hexdigest()
    assert store.exists(key) == 1

    exchanged = client.post("/auth/impersonate", json={"token": "impersonation-token-for-tests"})
    assert exchanged.status_code == 200
    access_token = exchanged.json()["access_token"]
    access_payload = decode_access_token(access_token)
    assert access_payload["sub"] == target.id
    assert access_payload["impersonated_by"] == admin.id
    assert store.exists(key) == 0

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "admin.impersonation_link_issued" in actions
    assert "auth.impersonation_consumed" in actions
    assert "admin.impersonation_session_issued" in actions
