from __future__ import annotations

from datetime import datetime, timedelta, timezone
from importlib import import_module
from unittest.mock import patch

from app.config import get_settings
from app.models import AuditLog, BackupManifest, BillingException, Job, Tenant, TenantMembership, User
from app.modules.subscription.models import Plan, Subscription
from app.modules.subscription.service import ensure_default_plan_catalog

SUPPORT_ADMIN_ROUTER_MODULE = import_module("app.modules.support.admin_router").list_all_tenants.__module__


class DummyRQJob:
    id = "rq-1"


class DummyCheckout:
    def __init__(
        self,
        session_id: str = "cs_mock_123",
        checkout_url: str = "https://mock-billing.local/checkout/cs_mock_123",
        provider: str = "stripe",
    ):
        self.session_id = session_id
        self.checkout_url = checkout_url
        self.customer_ref = "cus_mock_123"
        self.provider = provider
        self.mock_mode = True


class DummyGateway:
    def create_checkout(self, tenant, owner):
        return DummyCheckout()


def fake_enqueue(*args, **kwargs):
    return DummyRQJob()


def _auth_headers(client, db_session):
    client.post("/auth/signup", json={"email": "owner@example.com", "password": "Secret123!"})
    owner = db_session.query(User).filter(User.email == "owner@example.com").one()
    owner.email_verified = True
    owner.email_verified_at = datetime.now(timezone.utc)
    db_session.add(owner)
    db_session.commit()
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


def _support_headers(client, db_session):
    client.post("/auth/signup", json={"email": "support@example.com", "password": "Secret123!"})
    support_user = db_session.query(User).filter(User.email == "support@example.com").one()
    support_user.role = "support"
    db_session.add(support_user)
    db_session.commit()
    login = client.post("/auth/login", json={"email": "support@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _unverified_headers(client):
    client.post("/auth/signup", json={"email": "unverified@example.com", "password": "Secret123!"})
    login = client.post("/auth/login", json={"email": "unverified@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_create_and_list_tenant_returns_checkout(_, client, db_session):
    headers = _auth_headers(client, db_session)
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "acme", "company_name": "Acme Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    payload = create.json()
    assert payload["tenant"]["domain"] == "acme.erp.blenkotechnologies.co.tz"
    assert payload["tenant"]["status"] == "pending"
    assert payload["tenant"]["billing_status"] == "paid"
    assert payload["tenant"]["chosen_app"] is None
    assert payload["tenant"]["payment_provider"] == "stripe"
    assert payload["job"] is None
    assert payload["checkout_url"] == "https://mock-billing.local/checkout/cs_mock_123"
    assert payload["checkout_session_id"] == "cs_mock_123"

    listed = client.get("/tenants", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    tenant_id = payload["tenant"]["id"]
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant_id).one()
    assert subscription.plan.slug == "starter"
    assert subscription.status == "trialing"
    assert subscription.trial_ends_at is not None
    assert subscription.provider_checkout_session_id == "cs_mock_123"
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


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_membership_list_and_invite(_, client, db_session):
    headers = _auth_headers(client, db_session)
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "team", "company_name": "Team Co", "plan": "starter"},
    )
    tenant_id = create.json()["tenant"]["id"]

    members = client.get(f"/tenants/{tenant_id}/members", headers=headers)
    assert members.status_code == 200
    payload = members.json()
    assert len(payload) == 1
    assert payload[0]["role"] == "owner"

    client.post("/auth/signup", json={"email": "member@example.com", "password": "Secret123!"})
    invite = client.post(
        f"/tenants/{tenant_id}/members",
        headers=headers,
        json={"email": "member@example.com", "role": "billing"},
    )
    assert invite.status_code == 201
    invite_payload = invite.json()
    assert invite_payload["role"] == "billing"

    updated = client.patch(
        f"/tenants/{tenant_id}/members/{invite_payload['id']}",
        headers=headers,
        json={"role": "technical"},
    )
    assert updated.status_code == 200
    assert updated.json()["role"] == "technical"

    removed = client.delete(
        f"/tenants/{tenant_id}/members/{invite_payload['id']}",
        headers=headers,
    )
    assert removed.status_code == 200

    assert (
        db_session.query(TenantMembership)
        .filter(TenantMembership.user_id == invite_payload["user_id"], TenantMembership.tenant_id == tenant_id)
        .count()
        == 0
    )


@patch("app.modules.tenant.router.run_bench_command")
@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_reset_admin_password_blocked_for_suspended_billing_tenant(_, mock_run_bench_command, client, db_session):
    headers = _auth_headers(client, db_session)
    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "billing-blocked-reset", "company_name": "Billing Blocked Ltd", "plan": "starter"},
    )
    tenant_id = created.json()["tenant"]["id"]
    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "suspended_billing"
    tenant.billing_status = "failed"
    db_session.add(tenant)
    db_session.commit()

    blocked = client.post(
        f"/tenants/{tenant_id}/reset-admin-password",
        headers=headers,
        json={"new_password": "NeverApplied123!"},
    )
    assert blocked.status_code == 403
    assert "blocked until billing is restored" in blocked.json()["detail"].lower()
    mock_run_bench_command.assert_not_called()


@patch("app.modules.tenant.router.run_bench_command")
@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_reset_admin_password_blocked_for_delinquent_subscription(_, mock_run_bench_command, client, db_session):
    headers = _auth_headers(client, db_session)
    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "billing-delinquent-reset", "company_name": "Billing Delinquent Ltd", "plan": "starter"},
    )
    tenant_id = created.json()["tenant"]["id"]
    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "active"
    tenant.billing_status = "failed"
    db_session.add(tenant)
    db_session.commit()

    blocked = client.post(
        f"/tenants/{tenant_id}/reset-admin-password",
        headers=headers,
        json={},
    )
    assert blocked.status_code == 403
    assert "blocked until billing is restored" in blocked.json()["detail"].lower()
    mock_run_bench_command.assert_not_called()


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_retry_provisioning_blocked_for_delinquent_billing(_, client, db_session):
    headers = _auth_headers(client, db_session)
    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "billing-blocked-retry", "company_name": "Billing Retry Ltd", "plan": "starter"},
    )
    tenant_id = created.json()["tenant"]["id"]
    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "failed"
    tenant.billing_status = "failed"
    db_session.add(tenant)
    db_session.commit()

    blocked = client.post(f"/tenants/{tenant_id}/retry", headers=headers)
    assert blocked.status_code == 403
    assert "blocked until billing is restored" in blocked.json()["detail"].lower()

    db_session.expire_all()
    assert db_session.get(Tenant, tenant_id).status == "failed"


@patch("app.modules.tenant.router._domain_points_to_tenant", return_value=True)
@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_custom_domain_flow(_, __, client, db_session):
    headers = _auth_headers(client, db_session)
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "domains", "company_name": "Domains Ltd", "plan": "starter"},
    )
    tenant_id = create.json()["tenant"]["id"]

    created = client.post(
        f"/tenants/{tenant_id}/domains",
        headers=headers,
        json={"domain": "erp.domains.example.com"},
    )
    assert created.status_code == 201
    created_payload = created.json()
    assert created_payload["status"] == "pending"
    assert created_payload["verification_token"]

    listed = client.get(f"/tenants/{tenant_id}/domains", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    verified = client.post(
        f"/tenants/{tenant_id}/domains/{created_payload['id']}/verify",
        headers=headers,
        json={"token": created_payload["verification_token"]},
    )
    assert verified.status_code == 200
    assert verified.json()["status"] == "verified"

    removed = client.delete(
        f"/tenants/{tenant_id}/domains/{created_payload['id']}",
        headers=headers,
    )
    assert removed.status_code == 200

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "tenant.domains_viewed" in actions
    assert "tenant.domain_added" in actions
    assert "tenant.domain_verified" in actions
    assert "tenant.domain_removed" in actions


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_domain_mutations_blocked_when_billing_blocked(_, client, db_session):
    headers = _auth_headers(client, db_session)
    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "domain-blocked", "company_name": "Domain Blocked Ltd", "plan": "starter"},
    )
    assert created.status_code == 202
    tenant_id = created.json()["tenant"]["id"]

    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "suspended_billing"
    tenant.billing_status = "failed"
    db_session.add(tenant)
    db_session.commit()

    blocked = client.post(
        f"/tenants/{tenant_id}/domains",
        headers=headers,
        json={"domain": "billing-blocked.example.com"},
    )
    assert blocked.status_code == 403
    assert "billing" in blocked.json()["detail"].lower()


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_member_mutations_blocked_when_billing_blocked(_, client, db_session):
    headers = _auth_headers(client, db_session)
    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "members-blocked", "company_name": "Members Blocked Ltd", "plan": "starter"},
    )
    assert created.status_code == 202
    tenant_id = created.json()["tenant"]["id"]

    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "suspended_billing"
    tenant.billing_status = "failed"
    db_session.add(tenant)
    db_session.commit()

    blocked = client.post(
        f"/tenants/{tenant_id}/members",
        headers=headers,
        json={"email": "member-blocked@example.com", "role": "billing"},
    )
    assert blocked.status_code == 403
    assert "billing" in blocked.json()["detail"].lower()


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_restore_blocked_when_billing_blocked(_, client, db_session):
    headers = _auth_headers(client, db_session)
    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "restore-blocked", "company_name": "Restore Blocked Ltd", "plan": "starter"},
    )
    assert created.status_code == 202
    tenant_id = created.json()["tenant"]["id"]

    job = Job(tenant_id=tenant_id, type="backup", status="succeeded", logs="ok")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    manifest = BackupManifest(
        tenant_id=tenant_id,
        job_id=job.id,
        file_path="/tmp/restore-blocked.sql.gz",
        file_size_bytes=1024,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db_session.add(manifest)

    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "suspended_billing"
    tenant.billing_status = "failed"
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(manifest)

    blocked = client.post(
        f"/tenants/{tenant_id}/restore",
        headers=headers,
        json={"backup_id": manifest.id},
    )
    assert blocked.status_code == 403
    assert "billing" in blocked.json()["detail"].lower()


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_support_notes_admin_workflow(_, client, db_session):
    owner_headers = _auth_headers(client, db_session)
    create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "support-notes", "company_name": "Supportful Co", "plan": "starter"},
    )
    tenant_id = create.json()["tenant"]["id"]

    admin_headers = _admin_headers(client, db_session)
    created = client.post(
        "/admin/support-notes",
        headers=admin_headers,
        json={"tenant_id": tenant_id, "category": "incident", "note": "Investigated DNS propagation delays."},
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["tenant_id"] == tenant_id
    assert payload["category"] == "incident"

    listed = client.get("/admin/support-notes", headers=admin_headers, params={"tenant_id": tenant_id})
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "admin.create_support_note" in actions
    assert "admin.view_support_notes" in actions


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_unverified_user_cannot_create_tenant(_, client, db_session):
    headers = _unverified_headers(client)
    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "blocked", "company_name": "Blocked Ltd", "plan": "starter"},
    )
    assert create.status_code == 403
    assert "verify" in create.json()["detail"].lower()


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_create_tenant_idempotency_key_returns_cached_response(_, client, db_session):
    headers = _auth_headers(client, db_session)
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


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
@patch("app.modules.tenant.service.get_queue")
def test_create_tenant_rate_limit_and_backup_limit(mock_get_queue, _, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    headers = _auth_headers(client, db_session)

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
    business_plan = db_session.query(Plan).filter(Plan.slug == "business").one()
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant_id).one()
    db_tenant.plan = "business"
    db_tenant.chosen_app = "crm"
    db_tenant.status = "active"
    db_tenant.billing_status = "paid"
    subscription.plan_id = business_plan.id
    subscription.selected_app = "crm"
    db_session.add(subscription)
    db_session.add(db_tenant)
    db_session.commit()

    first_backup = client.post(f"/tenants/{tenant_id}/backup", headers=headers)
    second_backup = client.post(f"/tenants/{tenant_id}/backup", headers=headers)
    assert first_backup.status_code == 202
    assert second_backup.status_code == 429


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
@patch("app.modules.tenant.service.get_queue")
def test_backup_plan_daily_limit_enforced(mock_get_queue, _, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    headers = _auth_headers(client, db_session)

    create = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "quota", "company_name": "Quota Ltd", "plan": "business", "chosen_app": "helpdesk"},
    )
    tenant_id = create.json()["tenant"]["id"]

    db_tenant = db_session.get(Tenant, tenant_id)
    db_tenant.status = "active"
    db_tenant.billing_status = "paid"
    db_session.add(db_tenant)
    db_session.commit()

    for idx in range(3):
        db_session.add(
            AuditLog(
                actor_id=db_tenant.owner_id,
                actor_role="user",
                action="tenant.backup_started",
                resource="tenants",
                resource_id=db_tenant.id,
                metadata_json={"job_id": f"old-job-{idx}"},
            )
        )
    db_session.commit()

    blocked = client.post(f"/tenants/{tenant_id}/backup", headers=headers)
    assert blocked.status_code == 403
    assert "Plan limit reached" in blocked.json()["detail"]


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
@patch("app.modules.tenant.service.get_queue")
def test_backup_records_audit_event(mock_get_queue, _, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    headers = _auth_headers(client, db_session)

    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "auditbackup", "company_name": "Audit Backup Ltd", "plan": "business", "chosen_app": "helpdesk"},
    )
    assert created.status_code == 202
    tenant_id = created.json()["tenant"]["id"]

    db_tenant = db_session.get(Tenant, tenant_id)
    db_tenant.status = "active"
    db_tenant.billing_status = "paid"
    db_session.add(db_tenant)
    db_session.commit()

    backup = client.post(f"/tenants/{tenant_id}/backup", headers=headers)
    assert backup.status_code == 202

    actions = [
        row.action
        for row in db_session.query(AuditLog).filter(AuditLog.resource_id == tenant_id).order_by(AuditLog.created_at.asc()).all()
    ]
    assert "tenant.backup_started" in actions


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
@patch("app.modules.tenant.service.get_queue")
def test_delete_records_audit_event(mock_get_queue, _, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    headers = _auth_headers(client, db_session)

    created = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "auditdelete", "company_name": "Audit Delete Ltd", "plan": "starter"},
    )
    assert created.status_code == 202
    tenant_id = created.json()["tenant"]["id"]

    deleted = client.delete(f"/tenants/{tenant_id}", headers=headers)
    assert deleted.status_code == 202

    actions = [
        row.action
        for row in db_session.query(AuditLog).filter(AuditLog.resource_id == tenant_id).order_by(AuditLog.created_at.asc()).all()
    ]
    assert "tenant.delete" in actions


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_reserved_subdomain_security_headers_and_cors(_, client, db_session):
    headers = _auth_headers(client, db_session)

    available = client.get("/tenants/check-subdomain", headers=headers, params={"subdomain": "freshbiz"})
    assert available.status_code == 200
    assert available.json()["available"] is True
    assert available.json()["reason"] is None
    assert available.json()["domain"] == "freshbiz.erp.blenkotechnologies.co.tz"

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

    taken_source = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "freshbiz", "company_name": "Fresh Biz", "plan": "starter"},
    )
    assert taken_source.status_code == 202

    taken = client.get("/tenants/check-subdomain", headers=headers, params={"subdomain": "freshbiz"})
    assert taken.status_code == 200
    assert taken.json()["available"] is False
    assert taken.json()["reason"] == "taken"

    invalid = client.get("/tenants/check-subdomain", headers=headers, params={"subdomain": "%%%bad%%%"})
    assert invalid.status_code == 200
    assert invalid.json()["available"] is False
    assert invalid.json()["reason"] in {"invalid", "reserved"}


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_business_plan_requires_and_persists_chosen_app(_, client, db_session):
    headers = _auth_headers(client, db_session)

    missing = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "biz-missing", "company_name": "Biz Missing", "plan": "business"},
    )
    assert missing.status_code == 422
    assert "chosen_app is required" in missing.json()["detail"]

    created = client.post(
        "/tenants",
        headers=headers,
        json={
            "subdomain": "biz-ok",
            "company_name": "Biz OK",
            "plan": "business",
            "chosen_app": "helpdesk",
        },
    )
    assert created.status_code == 202
    assert created.json()["tenant"]["chosen_app"] == "helpdesk"


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_business_plan_rejects_non_allowlisted_chosen_app(_, client, db_session):
    headers = _auth_headers(client, db_session)
    response = client.post(
        "/tenants",
        headers=headers,
        json={
            "subdomain": "biz-invalid",
            "company_name": "Biz Invalid",
            "plan": "business",
            "chosen_app": "customapp",
        },
    )
    assert response.status_code == 422
    assert "allowlisted" in response.json()["detail"].lower()


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_starter_plan_rejects_chosen_app(_, client, db_session):
    headers = _auth_headers(client, db_session)
    response = client.post(
        "/tenants",
        headers=headers,
        json={
            "subdomain": "starter-app",
            "company_name": "Starter App",
            "plan": "starter",
            "chosen_app": "crm",
        },
    )
    assert response.status_code == 422
    assert "starter plan does not support chosen_app" in response.json()["detail"]


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_enterprise_plan_allows_null_chosen_app(_, client, db_session):
    headers = _auth_headers(client, db_session)
    response = client.post(
        "/tenants",
        headers=headers,
        json={
            "subdomain": "ent-null",
            "company_name": "Enterprise Null",
            "plan": "enterprise",
        },
    )
    assert response.status_code == 202
    assert response.json()["tenant"]["chosen_app"] is None


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_create_blocked_until_email_verified(_, client, db_session):
    client.post("/auth/signup", json={"email": "gate@example.com", "password": "Secret123!"})
    login = client.post("/auth/login", json={"email": "gate@example.com", "password": "Secret123!"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    blocked = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "verifygate", "company_name": "Verify Gate Ltd", "plan": "starter"},
    )
    assert blocked.status_code == 403
    assert "verification required" in blocked.json()["detail"].lower()

    owner = db_session.query(User).filter(User.email == "gate@example.com").one()
    owner.email_verified = True
    owner.email_verified_at = datetime.now(timezone.utc)
    db_session.add(owner)
    db_session.commit()

    allowed = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "verifygate", "company_name": "Verify Gate Ltd", "plan": "starter"},
    )
    assert allowed.status_code == 202


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_admin_can_create_tenant_without_email_verification(_, client, db_session):
    headers = _admin_headers(client, db_session)

    response = client.post(
        "/tenants",
        headers=headers,
        json={"subdomain": "admin-bypass", "company_name": "Admin Bypass", "plan": "starter"},
    )
    assert response.status_code == 202


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_mock_billing_checkout_blocked_in_production(_, monkeypatch, client, db_session):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("ALLOW_MOCK_BILLING", raising=False)
    get_settings.cache_clear()
    headers = _auth_headers(client, db_session)

    response = client.post(
        "/tenants",
        headers=headers,
        json={
            "subdomain": "prod-mock-block",
            "company_name": "Prod Mock Block",
            "plan": "starter",
        },
    )
    assert response.status_code == 503
    assert "billing provider" in response.json()["detail"].lower() or "mock billing" in response.json()["detail"].lower()
    get_settings.cache_clear()


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.PlatformERPClient.runtime_exists")
def test_admin_list_hides_stale_db_only_tenants(mock_runtime_exists, client, db_session):
    owner = User(email="owner-stale-admin@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    visible = Tenant(
        owner_id=owner.id,
        subdomain="visible-runtime",
        domain="visible-runtime.erp.blenkotechnologies.co.tz",
        site_name="visible-runtime.erp.blenkotechnologies.co.tz",
        company_name="Visible Runtime Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    stale = Tenant(
        owner_id=owner.id,
        subdomain="stale-runtime",
        domain="stale-runtime.erp.blenkotechnologies.co.tz",
        site_name="stale-runtime.erp.blenkotechnologies.co.tz",
        company_name="Stale Runtime Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    db_session.add_all([visible, stale])
    db_session.commit()

    mock_runtime_exists.side_effect = lambda runtime_name: runtime_name != stale.site_name

    headers = _admin_headers(client, db_session)
    response = client.get("/admin/tenants", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert [row["subdomain"] for row in payload] == ["visible-runtime"]


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
    assert db_session.get(Tenant, tenant.id).status == "suspended_admin"

    unsuspended = client.post(f"/admin/tenants/{tenant.id}/unsuspend", headers=headers)
    assert unsuspended.status_code == 200
    assert unsuspended.json()["message"] == "Tenant unsuspended"

    db_session.expire_all()
    assert db_session.get(Tenant, tenant.id).status == "active"

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "admin.view_all_tenants" in actions
    assert "admin.suspend_tenant" in actions
    assert "admin.unsuspend_tenant" in actions


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}._partition_runtime_visible_tenants")
def test_admin_list_hides_runtime_missing_tenants(partition_runtime, client, db_session):
    owner = User(email="owner-runtime-admin@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    visible_tenant = Tenant(
        owner_id=owner.id,
        subdomain="runtime-visible",
        domain="runtime-visible.erp.blenkotechnologies.co.tz",
        site_name="runtime-visible.erp.blenkotechnologies.co.tz",
        company_name="Runtime Visible Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    stale_tenant = Tenant(
        owner_id=owner.id,
        subdomain="runtime-stale",
        domain="runtime-stale.erp.blenkotechnologies.co.tz",
        site_name="runtime-stale.erp.blenkotechnologies.co.tz",
        company_name="Runtime Stale Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    db_session.add_all([visible_tenant, stale_tenant])
    db_session.commit()
    db_session.refresh(visible_tenant)
    db_session.refresh(stale_tenant)

    partition_runtime.return_value = ([visible_tenant], [stale_tenant])

    headers = _admin_headers(client, db_session)
    response = client.get("/admin/tenants", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert [row["id"] for row in payload] == [visible_tenant.id]

    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "admin.view_all_tenants")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert audit is not None
    assert audit.metadata_json["hidden_runtime_missing"] == 1


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


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}._partition_runtime_visible_tenants")
@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.PlatformERPClient")
@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_admin_billing_dunning_keeps_pending_payment_visible_while_hiding_runtime_missing_tenants(
    _,
    platform_client_cls,
    partition_runtime,
    client,
    db_session,
):
    owner_headers = _auth_headers(client, db_session)

    visible_create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "dunning-visible", "company_name": "Dunning Visible Ltd", "plan": "starter"},
    )
    stale_create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "dunning-stale", "company_name": "Dunning Stale Ltd", "plan": "starter"},
    )
    assert visible_create.status_code == 202
    assert stale_create.status_code == 202

    visible_id = visible_create.json()["tenant"]["id"]
    stale_id = stale_create.json()["tenant"]["id"]
    visible = db_session.get(Tenant, visible_id)
    stale = db_session.get(Tenant, stale_id)
    assert visible is not None
    assert stale is not None

    visible.status = "pending_payment"
    visible.billing_status = "unpaid"
    visible.platform_customer_id = "CUST-VISIBLE"
    stale.status = "suspended_billing"
    stale.billing_status = "unpaid"
    stale.platform_customer_id = "CUST-STALE"
    db_session.add_all([visible, stale])
    db_session.commit()

    partition_runtime.return_value = ([visible], [stale])

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.list_invoices.return_value = [
        {
            "name": "SINV-0001",
            "posting_date": "2026-03-10",
            "due_date": "2026-03-14",
        }
    ]

    admin_headers = _admin_headers(client, db_session)
    response = client.get("/admin/billing/dunning", headers=admin_headers)

    assert response.status_code == 200
    tenant_ids = {item["tenant_id"] for item in response.json()}
    assert visible_id in tenant_ids
    assert stale_id not in tenant_ids

    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "admin.view_billing_dunning")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert audit is not None
    assert audit.metadata_json["hidden_runtime_missing"] == 1


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.PlatformERPClient")
@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_admin_billing_dunning_includes_schedule_and_invoice_context(_, platform_client_cls, client, db_session):
    owner_headers = _auth_headers(client, db_session)
    create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "billing-dunning", "company_name": "Billing Dunning Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    tenant_id = create.json()["tenant"]["id"]

    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "pending_payment"
    tenant.billing_status = "unpaid"
    tenant.platform_customer_id = "CUST-001"
    db_session.add(tenant)
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.list_invoices.return_value = [
        {
            "name": "SINV-0001",
            "posting_date": "2026-03-10",
            "due_date": "2026-03-14",
        }
    ]

    admin_headers = _admin_headers(client, db_session)
    response = client.get("/admin/billing/dunning", headers=admin_headers)
    assert response.status_code == 200
    payload = response.json()
    row = next(item for item in payload if item["tenant_id"] == tenant_id)
    assert row["last_invoice_id"] == "SINV-0001"
    assert row["last_payment_attempt"].startswith("2026-03-10")
    assert row["next_retry_at"] is not None
    assert row["grace_ends_at"] is not None


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}._partition_runtime_visible_tenants")
@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.PlatformERPClient")
@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_admin_billing_dunning_hides_runtime_missing_tenants(_, platform_client_cls, partition_runtime, client, db_session):
    owner_headers = _auth_headers(client, db_session)
    create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "billing-runtime-hidden", "company_name": "Billing Hidden Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    tenant_id = create.json()["tenant"]["id"]

    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "suspended_billing"
    tenant.billing_status = "unpaid"
    tenant.platform_customer_id = "CUST-HIDDEN"
    db_session.add(tenant)
    db_session.commit()

    partition_runtime.return_value = ([], [tenant])
    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.list_invoices.return_value = []

    admin_headers = _admin_headers(client, db_session)
    response = client.get("/admin/billing/dunning", headers=admin_headers)
    assert response.status_code == 200
    assert response.json() == []

    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "admin.view_billing_dunning")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert audit is not None
    assert audit.metadata_json["hidden_runtime_missing"] == 1




def test_admin_billing_dunning_excludes_deleted_pending_subscription_rows(client, db_session):
    owner_headers = _auth_headers(client, db_session)
    create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "deleted-dunning-api", "company_name": "Deleted Dunning API Ltd", "plan": "starter"},
    )
    assert create.status_code == 202
    tenant_id = create.json()["tenant"]["id"]

    tenant = db_session.get(Tenant, tenant_id)
    assert tenant is not None
    tenant.status = "deleted"
    tenant.billing_status = "pending"
    db_session.add(tenant)
    db_session.commit()

    admin_headers = _admin_headers(client, db_session)
    response = client.get("/admin/billing/dunning", headers=admin_headers)

    assert response.status_code == 200
    tenant_ids = {item["tenant_id"] for item in response.json()}
    assert tenant_id not in tenant_ids



@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.PlatformERPClient.list_runtime_sites")
def test_admin_runtime_consistency_report_classifies_reconciliation_gaps(mock_list_runtime_sites, client, db_session):
    owner = User(email="consistency-owner@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    active_missing = Tenant(
        owner_id=owner.id,
        subdomain="active-missing",
        domain="active-missing.erp.blenkotechnologies.co.tz",
        site_name="active-missing.erp.blenkotechnologies.co.tz",
        company_name="Active Missing Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    pending_no_runtime = Tenant(
        owner_id=owner.id,
        subdomain="pending-no-runtime",
        domain="pending-no-runtime.erp.blenkotechnologies.co.tz",
        site_name="pending-no-runtime.erp.blenkotechnologies.co.tz",
        company_name="Pending No Runtime Ltd",
        plan="starter",
        status="pending",
        billing_status="pending",
    )
    pending_payment_no_runtime = Tenant(
        owner_id=owner.id,
        subdomain="pending-payment-no-runtime",
        domain="pending-payment-no-runtime.erp.blenkotechnologies.co.tz",
        site_name="pending-payment-no-runtime.erp.blenkotechnologies.co.tz",
        company_name="Pending Payment No Runtime Ltd",
        plan="starter",
        status="pending_payment",
        billing_status="pending",
    )
    deleted_with_runtime = Tenant(
        owner_id=owner.id,
        subdomain="deleted-with-runtime",
        domain="deleted-with-runtime.erp.blenkotechnologies.co.tz",
        site_name="deleted-with-runtime.erp.blenkotechnologies.co.tz",
        company_name="Deleted With Runtime Ltd",
        plan="starter",
        status="deleted",
        billing_status="pending",
    )
    db_session.add_all([active_missing, pending_no_runtime, pending_payment_no_runtime, deleted_with_runtime])
    db_session.commit()

    mock_list_runtime_sites.return_value = [
        "deleted-with-runtime.erp.blenkotechnologies.co.tz",
        "orphan-runtime.erp.blenkotechnologies.co.tz",
    ]

    headers = _admin_headers(client, db_session)
    response = client.get("/admin/tenants/runtime-consistency", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime_expected_missing"] == 1
    assert payload["pending_without_runtime"] == 1
    assert payload["pending_payment_without_runtime"] == 1
    assert payload["deleted_with_runtime"] == 1
    assert payload["runtime_sites_without_db_entry"] == 1
    assert payload["runtime_only_sites"] == ["orphan-runtime.erp.blenkotechnologies.co.tz"]

    by_domain = {entry["domain"]: entry for entry in payload["entries"]}
    assert by_domain[active_missing.domain]["classification"] == "runtime_expected_missing"
    assert by_domain[pending_no_runtime.domain]["classification"] == "pending_without_runtime"
    assert by_domain[pending_payment_no_runtime.domain]["classification"] == "pending_payment_without_runtime"
    assert by_domain[deleted_with_runtime.domain]["classification"] == "deleted_with_runtime"


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.PlatformERPClient.list_runtime_sites")
def test_admin_runtime_consistency_report_normalizes_site_names(mock_list_runtime_sites, client, db_session):
    owner = User(email="normalized-owner@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    tenant = Tenant(
        owner_id=owner.id,
        subdomain="normalized-site",
        domain="normalized-site.erp.blenkotechnologies.co.tz",
        site_name="https://normalized-site.erp.blenkotechnologies.co.tz",
        company_name="Normalized Site Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()

    mock_list_runtime_sites.return_value = ["normalized-site.erp.blenkotechnologies.co.tz"]

    headers = _admin_headers(client, db_session)
    response = client.get("/admin/tenants/runtime-consistency", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime_expected_missing"] == 0
    assert payload["runtime_sites_without_db_entry"] == 0
    assert payload["entries"] == []


@patch(f"{SUPPORT_ADMIN_ROUTER_MODULE}.get_queue")
def test_admin_can_queue_billing_dunning_cycle(mock_get_queue, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    headers = _admin_headers(client, db_session)

    response = client.post("/admin/billing/dunning/run?dry_run=true", headers=headers)
    assert response.status_code == 200
    assert "queued" in response.json()["message"].lower()

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "admin.run_billing_dunning_cycle" in actions


def test_admin_can_list_billing_reconciliation_exceptions(client, db_session):
    owner = User(email="billing-exception-owner@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    tenant = Tenant(
        owner_id=owner.id,
        subdomain="billing-exception",
        domain="billing-exception.erp.blenkotechnologies.co.tz",
        site_name="billing-exception.erp.blenkotechnologies.co.tz",
        company_name="Billing Exception Ltd",
        plan="starter",
        status="pending_payment",
        billing_status="failed",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    exception = BillingException(
        tenant_id=tenant.id,
        subscription_id=None,
        billing_account_id=None,
        billing_invoice_id="inv-local-1",
        payment_attempt_id="attempt-1",
        exception_type="erp_mismatch",
        status="open",
        reason="ERP invoice remains open while the platform marks payment as settled",
        details_json={"source": "test"},
    )
    db_session.add(exception)
    db_session.commit()

    headers = _admin_headers(client, db_session)
    response = client.get("/admin/billing/queues/reconciliation-exceptions", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["tenant_id"] == tenant.id
    assert payload[0]["invoice_id"] == "inv-local-1"
    assert payload[0]["payment_attempt_id"] == "attempt-1"
    assert payload[0]["exception_type"] == "erp_mismatch"
    assert payload[0]["severity"] == "high"
    assert payload[0]["status"] == "open"
    assert "platform marks payment as settled" in payload[0]["summary"]

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert "admin.view_billing_reconciliation_exceptions" in actions


def test_support_role_can_access_scoped_admin_reads_and_interventions(client, db_session):
    owner = User(email="owner-support-scope@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    tenant = Tenant(
        owner_id=owner.id,
        subdomain="support-scope",
        domain="support-scope.erp.blenkotechnologies.co.tz",
        site_name="support-scope.erp.blenkotechnologies.co.tz",
        company_name="Support Scope Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    headers = _support_headers(client, db_session)

    listed = client.get("/admin/tenants", headers=headers)
    assert listed.status_code == 200

    jobs = client.get("/admin/jobs?limit=5", headers=headers)
    assert jobs.status_code == 200

    audit_log = client.get("/admin/audit-log?page=1&limit=5", headers=headers)
    assert audit_log.status_code == 200

    created = client.post(
        "/admin/support-notes",
        headers=headers,
        json={"tenant_id": tenant.id, "category": "support", "note": "Scoped support intervention note."},
    )
    assert created.status_code == 201
    note_id = created.json()["id"]

    updated = client.patch(
        f"/admin/support-notes/{note_id}",
        headers=headers,
        json={"status": "resolved"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "resolved"

    suspend = client.post(f"/admin/tenants/{tenant.id}/suspend", headers=headers)
    assert suspend.status_code == 200

    unsuspend = client.post(f"/admin/tenants/{tenant.id}/unsuspend", headers=headers)
    assert unsuspend.status_code == 200


def test_support_role_cannot_access_admin_only_controls(client, db_session):
    headers = _support_headers(client, db_session)

    dunning_run = client.post("/admin/billing/dunning/run?dry_run=true", headers=headers)
    assert dunning_run.status_code == 403

    assets_build = client.post("/admin/maintenance/assets/build", headers=headers)
    assert assets_build.status_code == 403

    tls_sync = client.post("/admin/maintenance/tls/sync", headers=headers)
    assert tls_sync.status_code == 403

    impersonation = client.post(
        "/admin/impersonation-links",
        headers=headers,
        json={"target_email": "owner@example.com", "reason": "support-debug"},
    )
    assert impersonation.status_code == 403


def test_owner_job_view_records_audit(client, db_session):
    headers = _auth_headers(client, db_session)
    owner = db_session.query(User).filter(User.email == "owner@example.com").one()

    tenant = Tenant(
        owner_id=owner.id,
        subdomain="owner-job",
        domain="owner-job.erp.blenkotechnologies.co.tz",
        site_name="owner-job.erp.blenkotechnologies.co.tz",
        company_name="Owner Job Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="backup", status="succeeded", logs="done")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    response = client.get(f"/jobs/{job.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == job.id

    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "tenant.job_viewed", AuditLog.resource_id == job.id)
        .one()
    )
    assert audit.actor_id == owner.id
    assert audit.metadata_json["tenant_id"] == tenant.id


def test_tenants_paged_supports_status_plan_and_or_filters(client, db_session):
    headers = _auth_headers(client, db_session)
    owner = db_session.query(User).filter(User.email == "owner@example.com").one()

    tenants = [
        Tenant(
            owner_id=owner.id,
            subdomain="flt-active",
            domain="flt-active.erp.blenkotechnologies.co.tz",
            site_name="flt-active.erp.blenkotechnologies.co.tz",
            company_name="Filter Active Ltd",
            plan="starter",
            status="active",
            billing_status="paid",
            payment_channel="card",
        ),
        Tenant(
            owner_id=owner.id,
            subdomain="flt-sus-admin",
            domain="flt-sus-admin.erp.blenkotechnologies.co.tz",
            site_name="flt-sus-admin.erp.blenkotechnologies.co.tz",
            company_name="Filter Suspended Admin Ltd",
            plan="business",
            status="suspended_admin",
            billing_status="failed",
            payment_channel="mobile_money",
        ),
        Tenant(
            owner_id=owner.id,
            subdomain="flt-sus-billing",
            domain="flt-sus-billing.erp.blenkotechnologies.co.tz",
            site_name="flt-sus-billing.erp.blenkotechnologies.co.tz",
            company_name="Filter Suspended Billing Ltd",
            plan="enterprise",
            status="suspended_billing",
            billing_status="past_due",
            payment_channel="invoice",
        ),
    ]
    db_session.add_all(tenants)
    db_session.commit()
    ensure_default_plan_catalog(db_session)
    db_session.commit()
    plan_by_slug = {plan.slug: plan for plan in db_session.query(Plan).all()}
    status_by_subdomain = {
        "flt-active": "active",
        "flt-sus-admin": "past_due",
        "flt-sus-billing": "past_due",
    }
    for tenant in tenants:
        db_session.add(
            Subscription(
                tenant_id=tenant.id,
                plan_id=plan_by_slug[tenant.plan].id,
                status=status_by_subdomain[tenant.subdomain],
                payment_provider=tenant.payment_provider,
            )
        )
    db_session.commit()

    suspended = client.get("/tenants/paged?status=suspended&limit=20", headers=headers)
    assert suspended.status_code == 200
    suspended_statuses = {row["status"] for row in suspended.json()["data"]}
    assert suspended_statuses == {"suspended_admin", "suspended_billing"}

    business = client.get("/tenants/paged?plan=business&search=Filter&limit=20", headers=headers)
    assert business.status_code == 200
    assert business.json()["total"] == 1
    assert business.json()["data"][0]["subdomain"] == "flt-sus-admin"

    mode_or = client.get(
        "/tenants/paged?status=active&billing_status=failed&filter_mode=or&limit=20",
        headers=headers,
    )
    assert mode_or.status_code == 200
    returned = {row["subdomain"] for row in mode_or.json()["data"]}
    assert "flt-active" in returned
    assert "flt-sus-admin" in returned


def test_admin_tenants_paged_supports_suspended_alias(client, db_session):
    owner = User(email="owner-admin-filter@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    db_session.add_all(
        [
            Tenant(
                owner_id=owner.id,
                subdomain="admin-suspend-1",
                domain="admin-suspend-1.erp.blenkotechnologies.co.tz",
                site_name="admin-suspend-1.erp.blenkotechnologies.co.tz",
                company_name="Admin Suspend 1",
                plan="starter",
                status="suspended_admin",
                billing_status="failed",
            ),
            Tenant(
                owner_id=owner.id,
                subdomain="admin-suspend-2",
                domain="admin-suspend-2.erp.blenkotechnologies.co.tz",
                site_name="admin-suspend-2.erp.blenkotechnologies.co.tz",
                company_name="Admin Suspend 2",
                plan="enterprise",
                status="suspended_billing",
                billing_status="unpaid",
            ),
        ]
    )
    db_session.commit()

    headers = _admin_headers(client, db_session)
    response = client.get("/admin/tenants/paged?status=suspended&limit=20", headers=headers)
    assert response.status_code == 200
    statuses = {row["status"] for row in response.json()["data"]}
    assert statuses == {"suspended_admin", "suspended_billing"}


def test_tenants_requires_auth(client):
    response = client.get("/tenants")
    assert response.status_code == 401
