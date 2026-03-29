from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from app.models import User
from app.modules.subscription.models import Plan
from app.modules.subscription.service import ensure_default_plan_catalog


class DummyCheckout:
    def __init__(self):
        self.session_id = "cs_subs_123"
        self.checkout_url = "https://mock-billing.local/checkout/cs_subs_123"
        self.customer_ref = "cus_subs_123"
        self.provider = "stripe"
        self.payment_channel = "card"
        self.mock_mode = True


class DummyGateway:
    def create_checkout(self, tenant, owner):
        return DummyCheckout()


def _auth_headers(client, db_session):
    client.post("/auth/signup", json={"email": "owner-sub@example.com", "password": "Secret123!"})
    owner = db_session.query(User).filter(User.email == "owner-sub@example.com").one()
    owner.email_verified = True
    owner.email_verified_at = datetime.now(timezone.utc)
    db_session.add(owner)
    db_session.commit()
    login = client.post("/auth/login", json={"email": "owner-sub@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_public_plans_endpoint_returns_seeded_plans(client):
    response = client.get("/plans")
    assert response.status_code == 200
    payload = response.json()
    slugs = {item["slug"] for item in payload}
    assert {"starter", "business", "enterprise"} <= slugs


def test_public_plan_by_slug_returns_entitlements(client):
    response = client.get("/plans/business")
    assert response.status_code == 200
    payload = response.json()
    assert payload["slug"] == "business"
    assert any(item["mandatory"] is True and item["app_slug"] == "erpnext" for item in payload["entitlements"])
    assert any(item["selectable"] is True for item in payload["entitlements"])


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_subscription_endpoint_returns_plan_detail(_, client, db_session):
    headers = _auth_headers(client, db_session)
    created = client.post(
        "/tenants",
        headers=headers,
        json={
            "subdomain": "subsdetail",
            "company_name": "Subs Detail Ltd",
            "plan": "business",
            "chosen_app": "crm",
        },
    )
    assert created.status_code == 202
    tenant_id = created.json()["tenant"]["id"]

    response = client.get(f"/tenants/{tenant_id}/subscription", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["tenant_id"] == tenant_id
    assert payload["status"] == "pending"
    assert payload["plan"]["slug"] == "business"
    assert payload["selected_app"] == "crm"


@patch("app.modules.tenant.service.get_payment_gateway", return_value=DummyGateway())
def test_tenant_create_rejects_unsupported_plan_isolation_model(_, client, db_session):
    ensure_default_plan_catalog(db_session)
    business_plan = db_session.query(Plan).filter(Plan.slug == "business").one()
    business_plan.isolation_model = "silo_k3s"
    db_session.commit()

    headers = _auth_headers(client, db_session)
    response = client.post(
        "/tenants",
        headers=headers,
        json={
            "subdomain": "invalid-isolation",
            "company_name": "Invalid Isolation Ltd",
            "plan": "business",
            "chosen_app": "crm",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Unsupported isolation model 'silo_k3s' for plan 'business'. "
        "Supported models: pooled, silo_compose"
    )
