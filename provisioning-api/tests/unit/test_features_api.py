from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from app.models import Tenant, User


class DummyRQJob:
    id = "rq-feature-1"


def fake_enqueue(*args, **kwargs):
    return DummyRQJob()


class DummyCheckout:
    def __init__(self, provider: str = "stripe"):
        self.session_id = "cs_feature_123"
        self.checkout_url = "https://mock-billing.local/checkout/cs_feature_123"
        self.customer_ref = "cus_feature_123"
        self.provider = provider
        self.payment_channel = "card"
        self.mock_mode = True


class DummyGateway:
    def create_checkout(self, tenant, owner):
        return DummyCheckout()


def _auth_headers(client, db_session, email: str = "owner-feature@example.com"):
    client.post("/auth/signup", json={"email": email, "password": "Secret123!"})
    owner = db_session.query(User).filter(User.email == email).one()
    owner.email_verified = True
    owner.email_verified_at = datetime.now(timezone.utc)
    db_session.add(owner)
    db_session.commit()
    login = client.post("/auth/login", json={"email": email, "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(client, db_session):
    client.post("/auth/signup", json={"email": "admin-feature@example.com", "password": "Secret123!"})
    admin = db_session.query(User).filter(User.email == "admin-feature@example.com").one()
    admin.role = "admin"
    db_session.add(admin)
    db_session.commit()
    login = client.post("/auth/login", json={"email": "admin-feature@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
@patch("app.modules.tenant.service.get_queue")
def test_daily_backup_feature_gate_with_overrides(mock_get_queue, _, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    owner_headers = _auth_headers(client, db_session)
    admin_headers = _admin_headers(client, db_session)

    starter_create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "featstarter", "company_name": "Feat Starter Ltd", "plan": "starter"},
    )
    assert starter_create.status_code == 202
    starter_id = starter_create.json()["tenant"]["id"]

    enterprise_create = client.post(
        "/tenants",
        headers=owner_headers,
        json={"subdomain": "featenterprise", "company_name": "Feat Enterprise Ltd", "plan": "enterprise"},
    )
    assert enterprise_create.status_code == 202
    enterprise_id = enterprise_create.json()["tenant"]["id"]

    for tenant_id in [starter_id, enterprise_id]:
        tenant = db_session.get(Tenant, tenant_id)
        tenant.status = "active"
        tenant.billing_status = "paid"
        db_session.add(tenant)
    db_session.commit()

    starter_backup = client.post(f"/tenants/{starter_id}/backup", headers=owner_headers)
    assert starter_backup.status_code == 403
    assert "daily_backup" in starter_backup.json()["detail"]

    enterprise_backup = client.post(f"/tenants/{enterprise_id}/backup", headers=owner_headers)
    assert enterprise_backup.status_code == 202

    grant = client.put(
        f"/admin/features/tenants/{starter_id}/daily_backup",
        headers=admin_headers,
        json={"enabled": True},
    )
    assert grant.status_code == 200
    assert grant.json()["enabled"] is True

    starter_backup_after_override = client.post(f"/tenants/{starter_id}/backup", headers=owner_headers)
    assert starter_backup_after_override.status_code == 202

    revoke = client.put(
        f"/admin/features/tenants/{enterprise_id}/daily_backup",
        headers=admin_headers,
        json={"enabled": False},
    )
    assert revoke.status_code == 200
    assert revoke.json()["enabled"] is False

    enterprise_backup_after_revoke = client.post(f"/tenants/{enterprise_id}/backup", headers=owner_headers)
    assert enterprise_backup_after_revoke.status_code == 403
    assert "daily_backup" in enterprise_backup_after_revoke.json()["detail"]

