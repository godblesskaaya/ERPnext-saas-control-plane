from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.models import BillingAccount, BillingEvent, BillingInvoice, PaymentAttempt, Tenant, TenantMembership, User
from app.modules.subscription.models import Plan, Subscription


def _auth_headers(client, db_session, *, email: str) -> tuple[User, dict[str, str]]:
    password = "Secret123!"
    client.post("/auth/signup", json={"email": email, "password": password})
    user = db_session.query(User).filter(User.email == email).one()
    user.email_verified = True
    user.email_verified_at = datetime.now(timezone.utc)
    db_session.add(user)
    db_session.commit()

    login = client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    return user, {"Authorization": f"Bearer {token}"}


def _plan(slug: str) -> Plan:
    return Plan(
        slug=slug,
        display_name="Starter",
        isolation_model="single",
        monthly_price_usd_cents=1000,
        monthly_price_tzs=2500000,
        backup_frequency="daily",
        backup_retention_days=7,
        support_channel="email",
    )


def _seed_billing_graph(db_session, *, owner: User, tenant_suffix: str, add_member: User | None = None):
    now = datetime.now(timezone.utc)
    plan = _plan(f"starter-{tenant_suffix}")
    tenant = Tenant(
        owner_id=owner.id,
        subdomain=f"tenant-{tenant_suffix}",
        domain=f"tenant-{tenant_suffix}.erp.blenkotechnologies.co.tz",
        site_name=f"tenant-{tenant_suffix}.erp.blenkotechnologies.co.tz",
        company_name=f"Tenant {tenant_suffix}",
        plan="starter",
        status="pending_payment",
        payment_provider="azampay",
        platform_customer_id=f"CUST-{tenant_suffix}",
    )
    subscription = Subscription(
        tenant=tenant,
        plan=plan,
        status="pending",
        current_period_start=now - timedelta(days=1),
        current_period_end=now + timedelta(days=29),
        payment_provider="azampay",
        provider_customer_id=f"cust-{tenant_suffix}",
    )
    billing_account = BillingAccount(
        tenant=tenant,
        customer=owner,
        erp_customer_id=f"ERP-CUST-{tenant_suffix}",
        currency="TZS",
        status="linked",
    )
    open_invoice = BillingInvoice(
        tenant=tenant,
        subscription=subscription,
        billing_account=billing_account,
        erp_invoice_id=f"ACC-SINV-{tenant_suffix}-OPEN",
        invoice_number=f"ACC-SINV-{tenant_suffix}-OPEN",
        amount_due=120000,
        amount_paid=0,
        currency="TZS",
        invoice_status="payment_pending",
        collection_stage="retry_due",
        due_date=now + timedelta(days=2),
        issued_at=now - timedelta(days=1),
        last_synced_at=now,
    )
    older_paid_invoice = BillingInvoice(
        tenant=tenant,
        subscription=subscription,
        billing_account=billing_account,
        erp_invoice_id=f"ACC-SINV-{tenant_suffix}-PAID",
        invoice_number=f"ACC-SINV-{tenant_suffix}-PAID",
        amount_due=0,
        amount_paid=90000,
        currency="TZS",
        invoice_status="paid",
        collection_stage="settled",
        due_date=now - timedelta(days=15),
        issued_at=now - timedelta(days=20),
        paid_at=now - timedelta(days=14),
        last_synced_at=now - timedelta(days=14),
    )
    failed_attempt = PaymentAttempt(
        tenant=tenant,
        subscription=subscription,
        billing_invoice=open_invoice,
        provider="azampay",
        provider_reference=f"AZM-{tenant_suffix}",
        amount=120000,
        currency="TZS",
        status="failed",
        failure_reason="customer cancelled",
        checkout_url=f"https://payments.example.test/{tenant_suffix}",
        created_at=now - timedelta(hours=3),
        updated_at=now - timedelta(hours=1),
    )
    created_attempt = PaymentAttempt(
        tenant=tenant,
        subscription=subscription,
        billing_invoice=open_invoice,
        provider="azampay",
        provider_reference=f"AZM-{tenant_suffix}-2",
        amount=120000,
        currency="TZS",
        status="created",
        checkout_url=f"https://payments.example.test/{tenant_suffix}/new",
        created_at=now - timedelta(minutes=30),
        updated_at=now - timedelta(minutes=20),
    )
    older_event = BillingEvent(
        tenant=tenant,
        subscription=subscription,
        billing_account=billing_account,
        billing_invoice=open_invoice,
        payment_attempt=failed_attempt,
        event_type="billing.payment_failed",
        event_source="provider_webhook",
        severity="warning",
        summary="Payment failed",
        metadata_json={"provider": "azampay"},
        created_at=now - timedelta(hours=2),
    )
    newer_event = BillingEvent(
        tenant=tenant,
        subscription=subscription,
        billing_account=billing_account,
        billing_invoice=open_invoice,
        payment_attempt=created_attempt,
        event_type="billing.payment_attempt_created",
        event_source="api",
        severity="info",
        summary="Payment attempt created",
        metadata_json={"provider": "azampay"},
        created_at=now - timedelta(minutes=10),
    )
    db_session.add_all([
        plan,
        tenant,
        subscription,
        billing_account,
        open_invoice,
        older_paid_invoice,
        failed_attempt,
        created_attempt,
        older_event,
        newer_event,
    ])
    if add_member is not None:
        db_session.add(TenantMembership(tenant=tenant, user_id=add_member.id, role="billing"))
    db_session.commit()
    return tenant, open_invoice, created_attempt, newer_event, older_event


def test_billing_account_workspace_returns_invoice_backed_summary(client, db_session):
    owner, headers = _auth_headers(client, db_session, email="workspace-owner@example.com")
    tenant, invoice, latest_attempt, _, _ = _seed_billing_graph(db_session, owner=owner, tenant_suffix="acct")

    response = client.get(f"/billing/accounts/{tenant.id}", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["tenantId"] == tenant.id
    assert payload["accountStatus"] == "linked"
    assert payload["status"]["source"] == "billing_read_model"
    assert payload["status"]["latestInvoiceId"] == invoice.id
    assert payload["openInvoices"][0]["id"] == invoice.id
    assert payload["latestPaymentAttempt"]["id"] == latest_attempt.id
    assert payload["actions"]["canCreatePaymentAttempt"] is False
    assert payload["actions"]["canOpenInvoice"] is True


def test_billing_invoice_and_payment_attempt_collections_are_tenant_scoped(client, db_session):
    owner, headers = _auth_headers(client, db_session, email="collections-owner@example.com")
    tenant, invoice, latest_attempt, _, _ = _seed_billing_graph(db_session, owner=owner, tenant_suffix="collections")

    invoices_response = client.get(f"/billing/invoices/{tenant.id}", headers=headers)
    attempts_response = client.get(f"/billing/payment-attempts/{tenant.id}", headers=headers)

    assert invoices_response.status_code == 200
    assert attempts_response.status_code == 200
    invoices_payload = invoices_response.json()
    attempts_payload = attempts_response.json()
    assert invoices_payload["tenantId"] == tenant.id
    assert invoices_payload["invoices"][0]["id"] == invoice.id
    assert attempts_payload["tenantId"] == tenant.id
    assert attempts_payload["paymentAttempts"][0]["id"] == latest_attempt.id
    assert attempts_payload["paymentAttempts"][0]["status"] == "created"


def test_billing_invoice_detail_forbidden_for_unrelated_user(client, db_session):
    owner, _ = _auth_headers(client, db_session, email="invoice-owner@example.com")
    intruder, intruder_headers = _auth_headers(client, db_session, email="invoice-intruder@example.com")
    assert intruder.id != owner.id
    _, invoice, _, _, _ = _seed_billing_graph(db_session, owner=owner, tenant_suffix="forbidden")

    response = client.get(f"/billing/invoice/{invoice.id}", headers=intruder_headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"


def test_billing_timeline_returns_latest_events_first(client, db_session):
    owner, headers = _auth_headers(client, db_session, email="timeline-owner@example.com")
    tenant, _, _, newer_event, older_event = _seed_billing_graph(db_session, owner=owner, tenant_suffix="timeline")

    response = client.get(f"/billing/timeline/{tenant.id}", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["tenantId"] == tenant.id
    assert [item["id"] for item in payload["events"][:2]] == [newer_event.id, older_event.id]
    assert payload["events"][0]["type"] == "billing.payment_attempt_created"


def test_billing_account_workspace_falls_back_to_legacy_status_without_read_model(client, db_session):
    owner, headers = _auth_headers(client, db_session, email="legacy-owner@example.com")
    plan = _plan(f"starter-{uuid4().hex[:8]}")
    now = datetime.now(timezone.utc)
    tenant = Tenant(
        owner_id=owner.id,
        subdomain=f"tenant-{uuid4().hex[:6]}",
        domain=f"tenant-{uuid4().hex[:6]}.erp.blenkotechnologies.co.tz",
        site_name=f"tenant-{uuid4().hex[:6]}.erp.blenkotechnologies.co.tz",
        company_name="Legacy Tenant",
        plan="starter",
        status="active",
        payment_provider="azampay",
    )
    subscription = Subscription(
        tenant=tenant,
        plan=plan,
        status="active",
        current_period_start=now - timedelta(days=1),
        current_period_end=now + timedelta(days=29),
        payment_provider="azampay",
    )
    db_session.add_all([plan, tenant, subscription])
    db_session.commit()

    response = client.get(f"/billing/accounts/{tenant.id}", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["accountStatus"] == "missing"
    assert payload["status"]["source"] == "legacy_status"
    assert payload["openInvoices"] == []
    assert payload["latestPaymentAttempt"] is None
