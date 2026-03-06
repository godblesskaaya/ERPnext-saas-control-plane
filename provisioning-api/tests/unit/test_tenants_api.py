from __future__ import annotations

from unittest.mock import patch

from app.models import AuditLog, Job, Tenant, User


class DummyRQJob:
    id = "rq-1"


class DummyCheckout:
    def __init__(self, session_id: str = "cs_mock_123", checkout_url: str = "https://mock-billing.local/checkout/cs_mock_123"):
        self.session_id = session_id
        self.checkout_url = checkout_url
        self.customer_id = "cus_mock_123"
        self.mock_mode = True


def fake_enqueue(*args, **kwargs):
    return DummyRQJob()


def _auth_headers(client):
    client.post("/auth/signup", json={"email": "owner@example.com", "password": "Secret123!"})
    login = client.post("/auth/login", json={"email": "owner@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(client, db_session):
    client.post("/auth/signup", json={"email": "admin@example.com", "password": "Secret123!"})
    admin = db_session.query(User).filter(User.email == "admin@example.com").one()
    admin.role = "admin"
    db_session.add(admin)
    db_session.commit()
    login = client.post("/auth/login", json={"email": "admin@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@patch("app.services.tenant_service.billing_client.create_checkout_session", return_value=DummyCheckout())
def test_create_and_list_tenant_returns_checkout(_, client, db_session):
    headers = _auth_headers(client)
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "acme", "company_name": "Acme Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    payload = create.json()
    assert payload["tenant"]["domain"] == "acme.erp.blenkotechnologies.co.tz"
    assert payload["tenant"]["status"] == "pending"
    assert payload["tenant"]["billing_status"] == "pending"
    assert payload["job"] is None
    assert payload["checkout_url"] == "https://mock-billing.local/checkout/cs_mock_123"
    assert payload["checkout_session_id"] == "cs_mock_123"

    listed = client.get("/tenants", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    tenant_id = payload["tenant"]["id"]
    reset = client.post(
        f"/tenants/{tenant_id}/reset-admin-password",
        headers=headers,
        json={"new_password": "NewStrongPass123!"},
    )
    assert reset.status_code == 200
    reset_payload = reset.json()
    assert reset_payload["administrator_user"] == "Administrator"
    assert reset_payload["admin_password"] == "NewStrongPass123!"

    auto_reset = client.post(
        f"/tenants/{tenant_id}/reset-admin-password",
        headers=headers,
        json={},
    )
    assert auto_reset.status_code == 200
    assert len(auto_reset.json()["admin_password"]) >= 8

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "tenant.create" in actions
    assert actions.count("tenant.reset_admin_password") == 2


@patch("app.services.tenant_service.billing_client.create_checkout_session", return_value=DummyCheckout())
def test_create_tenant_idempotency_key_returns_cached_response(_, client, db_session):
    headers = _auth_headers(client)
    headers["X-Idempotency-Key"] = "idem-123"

    first = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "idem", "company_name": "Idem Ltd", "plan": "starter"},
    )
    second = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "idem", "company_name": "Idem Ltd", "plan": "starter"},
    )

    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json()["tenant"]["id"] == first.json()["tenant"]["id"]
    assert db_session.query(Tenant).filter(Tenant.subdomain == "idem").count() == 1


@patch("app.services.tenant_service.billing_client.create_checkout_session", return_value=DummyCheckout())
@patch("app.services.tenant_service.get_queue")
def test_create_tenant_rate_limit_and_backup_limit(mock_get_queue, _, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    headers = _auth_headers(client)

    for index in range(3):
        create = client.post(
            "/tenants",
            headers=headers,
            json={
                "subdomain": f"tenant-{index}",
                "company_name": f"Tenant {index}",
                "plan": "starter",
            },
        )
        assert create.status_code == 202

    limited = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "tenant-overflow", "company_name": "Overflow", "plan": "starter"},
    )
    assert limited.status_code == 429

    tenant_id = client.get("/tenants", headers=headers).json()[0]["id"]
    db_tenant = db_session.get(Tenant, tenant_id)
    db_tenant.status = "active"
    db_tenant.billing_status = "paid"
    db_session.add(db_tenant)
    db_session.commit()

    first_backup = client.post(f"/tenants/{tenant_id}/backup", headers=headers)
    second_backup = client.post(f"/tenants/{tenant_id}/backup", headers=headers)
    assert first_backup.status_code == 202
    assert second_backup.status_code == 429


@patch("app.services.tenant_service.billing_client.create_checkout_session", return_value=DummyCheckout())
@patch("app.services.tenant_service.get_queue")
def test_backup_plan_daily_limit_enforced(mock_get_queue, _, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    headers = _auth_headers(client)

    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "quota", "company_name": "Quota Ltd", "plan": "starter"},
    )
    tenant_id = create.json()["tenant"]["id"]

    db_tenant = db_session.get(Tenant, tenant_id)
    db_tenant.status = "active"
    db_tenant.billing_status = "paid"
    db_session.add(db_tenant)
    db_session.commit()

    db_session.add(
        AuditLog(
            actor_id=db_tenant.owner_id,
            actor_role="user",
            action="tenant.backup_started",
            resource="tenants",
            resource_id=db_tenant.id,
            metadata_json={"job_id": "old-job"},
        )
    )
    db_session.commit()

    blocked = client.post(f"/tenants/{tenant_id}/backup", headers=headers)
    assert blocked.status_code == 403
    assert "Plan limit reached" in blocked.json()["detail"]


@patch("app.services.tenant_service.billing_client.create_checkout_session", return_value=DummyCheckout())
def test_reserved_subdomain_security_headers_and_cors(_, client):
    headers = _auth_headers(client)

    reserved = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "admin", "company_name": "Reserved", "plan": "starter"},
    )
    assert reserved.status_code == 422
    assert reserved.json()["detail"] == "This subdomain is reserved"

    allowed = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert allowed.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert allowed.headers["x-content-type-options"] == "nosniff"
    assert allowed.headers["x-frame-options"] == "DENY"
    assert allowed.headers["content-security-policy"].startswith("default-src 'self'")
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"

    blocked = client.options(
        "/tenants",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in blocked.headers


def test_admin_list_and_suspend_audit_state_changes(client, db_session):
    user = User(email="owner2@example.com", password_hash="hash", role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="ops",
        domain="ops.erp.blenkotechnologies.co.tz",
        site_name="ops.erp.blenkotechnologies.co.tz",
        company_name="Ops Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    headers = _admin_headers(client, db_session)

    listed = client.get("/admin/tenants", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    suspended = client.post(f"/admin/tenants/{tenant.id}/suspend", headers=headers)
    assert suspended.status_code == 200
    assert suspended.json()["message"] == "Tenant suspended"

    db_session.expire_all()
    assert db_session.get(Tenant, tenant.id).status == "suspended"

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "admin.view_all_tenants" in actions
    assert "admin.suspend_tenant" in actions


def test_admin_jobs_and_logs_view(client, db_session):
    owner = User(email="owner-jobs@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    tenant = Tenant(
        owner_id=owner.id,
        subdomain="ops-jobs",
        domain="ops-jobs.erp.blenkotechnologies.co.tz",
        site_name="ops-jobs.erp.blenkotechnologies.co.tz",
        company_name="Ops Jobs Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    job = Job(
        tenant_id=tenant.id,
        type="backup",
        status="succeeded",
        logs="backup completed",
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    headers = _admin_headers(client, db_session)

    listed = client.get("/admin/jobs?limit=10", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == job.id

    logs = client.get(f"/admin/jobs/{job.id}/logs", headers=headers)
    assert logs.status_code == 200
    assert logs.json()["logs"] == "backup completed"

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "admin.view_jobs" in actions
    assert "admin.view_job_logs" in actions


def test_tenants_requires_auth(client):
    response = client.get("/tenants")
    assert response.status_code == 401
