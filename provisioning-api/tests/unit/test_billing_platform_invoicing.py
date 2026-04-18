from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from app.models import Tenant, User


def _auth_headers(client, db_session):
    client.post("/auth/signup", json={"email": "owner-billing@example.com", "password": "Secret123!"})
    owner = db_session.query(User).filter(User.email == "owner-billing@example.com").one()
    owner.email_verified = True
    owner.email_verified_at = datetime.now(timezone.utc)
    db_session.add(owner)
    db_session.commit()

    login = client.post("/auth/login", json={"email": "owner-billing@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return owner, {"Authorization": f"Bearer {token}"}


@patch("app.modules.billing.router.PlatformERPClient")
def test_billing_portal_requires_platform_erp_configuration(platform_client_cls, client, db_session):
    _, headers = _auth_headers(client, db_session)
    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = False

    response = client.get("/billing/portal", headers=headers)

    assert response.status_code == 501
    assert response.json()["detail"] == "Platform ERP billing is not configured."


@patch("app.modules.billing.router.PlatformERPClient")
def test_billing_portal_returns_platform_erp_workspace_url(platform_client_cls, client, db_session):
    _, headers = _auth_headers(client, db_session)
    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.base_url = "https://erp.example.com"

    response = client.get("/billing/portal", headers=headers)

    assert response.status_code == 200
    assert response.json()["url"] == "https://erp.example.com/app/sales-invoice"


@patch("app.modules.billing.router.PlatformERPClient")
def test_billing_invoices_always_report_platform_erp_provider(platform_client_cls, client, db_session):
    owner, headers = _auth_headers(client, db_session)
    tenant = Tenant(
        owner_id=owner.id,
        subdomain="platform-invoice",
        domain="platform-invoice.erp.blenkotechnologies.co.tz",
        site_name="platform-invoice.erp.blenkotechnologies.co.tz",
        company_name="Platform Invoice Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
        payment_provider="stripe",
        platform_customer_id="CUST-123",
    )
    db_session.add(tenant)
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.list_invoices.return_value = [
        {
            "name": "SINV-0009",
            "status": "Overdue",
            "outstanding_amount": 5000,
            "grand_total": 15000,
            "currency": "TZS",
            "posting_date": "2026-03-10",
        }
    ]
    platform_client.invoice_url.return_value = "https://erp.example.com/app/sales-invoice/SINV-0009"

    response = client.get("/billing/invoices", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["invoices"]) == 1
    assert payload["invoices"][0]["metadata"]["payment_provider"] == "platform_erp"


@patch("app.modules.tenant.router.get_payment_gateway", side_effect=RuntimeError("payment gateway should not be used"))
@patch("app.modules.tenant.router.PlatformERPClient")
def test_tenant_summary_does_not_use_provider_invoice_fallback(platform_client_cls, _, client, db_session):
    owner, headers = _auth_headers(client, db_session)
    tenant = Tenant(
        owner_id=owner.id,
        subdomain="summary-no-fallback",
        domain="summary-no-fallback.erp.blenkotechnologies.co.tz",
        site_name="summary-no-fallback.erp.blenkotechnologies.co.tz",
        company_name="Summary No Fallback Ltd",
        plan="starter",
        status="active",
        billing_status="paid",
        payment_provider="stripe",
    )
    db_session.add(tenant)
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = False

    response = client.get(f"/tenants/{tenant.id}/summary", headers=headers)

    assert response.status_code == 200
    assert response.json()["last_invoice"] is None
