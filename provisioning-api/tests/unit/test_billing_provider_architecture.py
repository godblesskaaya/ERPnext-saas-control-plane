from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from app.config import get_settings
from app.models import Tenant, User


def _auth_headers(client, db_session):
    email = "owner-arch@example.com"
    password = "Secret123!"
    client.post("/auth/signup", json={"email": email, "password": password})
    owner = db_session.query(User).filter(User.email == email).one()
    owner.email_verified = True
    owner.email_verified_at = datetime.now(timezone.utc)
    db_session.add(owner)
    db_session.commit()
    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, owner


@patch("app.modules.billing.router.PlatformERPClient")
def test_billing_invoices_force_gateway_only_payment_provider(platform_client_cls, client, db_session):
    headers, owner = _auth_headers(client, db_session)
    tenant = Tenant(
        owner_id=owner.id,
        subdomain="billing-provider-arch",
        domain="billing-provider-arch.erp.blenkotechnologies.co.tz",
        site_name="billing-provider-arch.erp.blenkotechnologies.co.tz",
        company_name="Billing Provider Arch Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
        platform_customer_id="CUST-ARCH-1",
        payment_provider="platform_erp",
    )
    db_session.add(tenant)
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.has_base_url.return_value = True
    platform_client.has_api_credentials.return_value = True
    platform_client.is_configured.return_value = True
    platform_client.list_invoices.return_value = [
        {
            "name": "SINV-ARCH-1",
            "status": "Unpaid",
            "currency": "TZS",
            "outstanding_amount": "10000",
            "grand_total": "12000",
            "posting_date": "2026-03-10",
        }
    ]
    platform_client.invoice_url.return_value = "https://erp.example.test/invoice/SINV-ARCH-1"

    response = client.get("/billing/invoices", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    invoice = payload["invoices"][0]
    assert invoice["metadata"]["payment_provider"] == get_settings().active_payment_provider
    assert invoice["metadata"]["payment_provider"] != "platform_erp"


@patch("app.modules.tenant.router.PlatformERPClient")
def test_tenant_summary_force_gateway_only_payment_provider(platform_client_cls, client, db_session):
    headers, owner = _auth_headers(client, db_session)
    tenant = Tenant(
        owner_id=owner.id,
        subdomain="tenant-summary-provider-arch",
        domain="tenant-summary-provider-arch.erp.blenkotechnologies.co.tz",
        site_name="tenant-summary-provider-arch.erp.blenkotechnologies.co.tz",
        company_name="Tenant Summary Provider Arch Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
        platform_customer_id="CUST-ARCH-2",
        payment_provider="platform_erp",
    )
    db_session.add(tenant)
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.list_invoices.return_value = [
        {
            "name": "SINV-ARCH-2",
            "status": "Draft",
            "currency": "TZS",
            "outstanding_amount": "5000",
            "grand_total": "5000",
            "posting_date": "2026-03-11",
        }
    ]
    platform_client.invoice_url.return_value = "https://erp.example.test/invoice/SINV-ARCH-2"

    response = client.get(f"/tenants/{tenant.id}/summary", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["last_invoice"]["metadata"]["payment_provider"] == get_settings().active_payment_provider
    assert payload["last_invoice"]["metadata"]["payment_provider"] != "platform_erp"


@patch("app.modules.billing.router.PlatformERPClient")
def test_billing_portal_uses_platform_base_url_without_provider_fallback(platform_client_cls, client, db_session, monkeypatch):
    headers, _ = _auth_headers(client, db_session)
    platform_client = platform_client_cls.return_value
    platform_client.has_base_url.return_value = True
    platform_client.base_url = "https://erp.example.test"

    def _unexpected_gateway_lookup():
        raise AssertionError("Provider fallback must not execute for /billing/portal")

    monkeypatch.setattr("app.modules.billing.router.get_payment_gateway", _unexpected_gateway_lookup)

    response = client.get("/billing/portal", headers=headers)
    assert response.status_code == 200
    assert response.json()["url"] == "https://erp.example.test/app/sales-invoice"


@patch("app.modules.tenant.router.PlatformERPClient")
def test_tenant_summary_skips_provider_invoice_fallback_when_platform_erp_not_configured(
    platform_client_cls,
    client,
    db_session,
    monkeypatch,
):
    headers, owner = _auth_headers(client, db_session)
    tenant = Tenant(
        owner_id=owner.id,
        subdomain="tenant-summary-no-fallback",
        domain="tenant-summary-no-fallback.erp.blenkotechnologies.co.tz",
        site_name="tenant-summary-no-fallback.erp.blenkotechnologies.co.tz",
        company_name="Tenant Summary No Fallback Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
        payment_provider="stripe",
    )
    db_session.add(tenant)
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = False

    def _unexpected_gateway_lookup():
        raise AssertionError("Provider invoice fallback must not execute for tenant summary")

    monkeypatch.setattr("app.modules.tenant.router.get_payment_gateway", _unexpected_gateway_lookup)

    response = client.get(f"/tenants/{tenant.id}/summary", headers=headers)
    assert response.status_code == 200
    assert response.json()["last_invoice"] is None
