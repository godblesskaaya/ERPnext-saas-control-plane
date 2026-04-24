from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import AuditLog, BillingEvent, BillingInvoice, Job, PaymentAttempt, Tenant, User
from app.modules.subscription.models import Plan, Subscription


class FakeInvoiceGateway:
    provider_name = "azampay"

    def create_invoice_checkout(self, invoice, tenant, owner, *, return_url=None, cancel_url=None, channel_hint=None):
        assert invoice.amount_due == 125000
        assert tenant.id is not None
        assert owner.id is not None
        assert return_url == "https://app.example.com/billing"
        assert cancel_url == "https://app.example.com/billing/cancel"
        assert channel_hint == "mobile_money"

        from app.modules.billing.payment.base import CheckoutResult

        return CheckoutResult(
            session_id="attempt-session-123",
            checkout_url="https://payments.example.com/attempt-session-123",
            customer_ref=owner.id,
            provider=self.provider_name,
            payment_channel="mobile_money",
            payment_method_types=["mobile_money"],
            mock_mode=False,
        )


class FakeWebhookGateway:
    provider_name = "azampay"

    def __init__(self, *, event_type: str, tenant_id: str | None, subscription_id: str | None, raw: dict | None = None):
        self.event_type = event_type
        self.tenant_id = tenant_id
        self.subscription_id = subscription_id
        self.raw = raw or {}

    def parse_webhook(self, payload: bytes, headers: dict[str, str]):
        del payload, headers
        from app.modules.billing.payment.base import WebhookEvent

        return WebhookEvent(
            event_type=self.event_type,
            tenant_id=self.tenant_id,
            subscription_id=self.subscription_id,
            customer_ref="255700000000",
            raw={"provider": self.provider_name, **self.raw},
        )


class DummyRQJob:
    id = "rq-billing-attempt-1"



def fake_enqueue(*args, **kwargs):
    return DummyRQJob()



def _auth_headers(client, db_session, *, email: str, role: str = "customer") -> tuple[User, dict[str, str]]:
    password = "Secret123!"
    client.post("/auth/signup", json={"email": email, "password": password})
    user = db_session.query(User).filter(User.email == email).one()
    user.email_verified = True
    user.email_verified_at = datetime.now(timezone.utc)
    user.role = role
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



def _seed_invoice(db_session, *, owner: User, suffix: str, amount_due: int = 125000, invoice_status: str = "payment_pending"):
    now = datetime.now(timezone.utc)
    plan = _plan(f"starter-{suffix}")
    tenant = Tenant(
        owner_id=owner.id,
        subdomain=f"tenant-{suffix}",
        domain=f"tenant-{suffix}.erp.blenkotechnologies.co.tz",
        site_name=f"tenant-{suffix}.erp.blenkotechnologies.co.tz",
        company_name=f"Tenant {suffix}",
        plan="starter",
        status="pending_payment",
        payment_provider="azampay",
        platform_customer_id=f"ERP-CUST-{suffix}",
    )
    subscription = Subscription(
        tenant=tenant,
        plan=plan,
        status="pending",
        current_period_start=now - timedelta(days=1),
        current_period_end=now + timedelta(days=29),
        payment_provider="azampay",
    )
    db_session.add_all([plan, tenant, subscription])
    db_session.flush()

    from app.models import BillingAccount

    account = BillingAccount(
        tenant=tenant,
        customer_id=owner.id,
        erp_customer_id=tenant.platform_customer_id,
        currency="TZS",
        status="linked",
    )
    db_session.add(account)
    db_session.flush()

    invoice = BillingInvoice(
        tenant_id=tenant.id,
        subscription_id=subscription.id,
        billing_account_id=account.id,
        erp_invoice_id=f"SINV-{suffix}",
        invoice_number=f"SINV-{suffix}",
        amount_due=amount_due,
        amount_paid=0,
        currency="TZS",
        invoice_status=invoice_status,
        due_date=now + timedelta(days=2),
        issued_at=now - timedelta(days=1),
    )
    db_session.add(invoice)
    db_session.commit()
    return tenant, invoice



def _seed_payment_attempt(db_session, *, tenant: Tenant, invoice: BillingInvoice, provider_reference: str, amount: int | None = None) -> PaymentAttempt:
    attempt = PaymentAttempt(
        tenant_id=tenant.id,
        subscription_id=invoice.subscription_id,
        billing_invoice_id=invoice.id,
        provider="azampay",
        provider_reference=provider_reference,
        amount=amount if amount is not None else invoice.amount_due,
        currency=invoice.currency,
        status="checkout_started",
        checkout_url=f"https://payments.example.com/{provider_reference}",
        provider_payload_snapshot={"invoice_id": invoice.id},
        provider_response_snapshot={"session_id": provider_reference},
    )
    db_session.add(attempt)
    db_session.commit()
    return attempt


@patch("app.modules.billing.payment_attempt_service.get_payment_gateway", return_value=FakeInvoiceGateway())
def test_create_invoice_payment_attempt_persists_invoice_backed_attempt(_, client, db_session):
    owner, headers = _auth_headers(client, db_session, email="invoice-pay-owner@example.com")
    tenant, invoice = _seed_invoice(db_session, owner=owner, suffix="attempt")

    response = client.post(
        f"/billing/invoice/{invoice.id}/payment-attempts",
        headers=headers,
        json={
            "provider": "azampay",
            "returnUrl": "https://app.example.com/billing",
            "cancelUrl": "https://app.example.com/billing/cancel",
            "channelHint": "mobile_money",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["paymentAttempt"]["invoiceId"] == invoice.id
    assert payload["paymentAttempt"]["provider"] == "azampay"
    assert payload["paymentAttempt"]["status"] == "checkout_started"
    assert payload["paymentAttempt"]["amount"] == 125000

    attempt = db_session.query(PaymentAttempt).filter(PaymentAttempt.billing_invoice_id == invoice.id).one()
    assert attempt.provider_reference == "attempt-session-123"
    assert attempt.amount == 125000
    assert attempt.checkout_url == "https://payments.example.com/attempt-session-123"

    actions = [row.action for row in db_session.query(AuditLog).filter(AuditLog.resource_id == attempt.id).all()]
    assert "billing.payment_attempt_created" in actions


@patch("app.modules.billing.payment_attempt_service.get_payment_gateway", return_value=FakeInvoiceGateway())
def test_create_invoice_payment_attempt_rejects_non_payable_invoice(_, client, db_session):
    owner, headers = _auth_headers(client, db_session, email="invoice-not-payable-owner@example.com")
    _, invoice = _seed_invoice(db_session, owner=owner, suffix="nonpayable", amount_due=0, invoice_status="paid")

    response = client.post(
        f"/billing/invoice/{invoice.id}/payment-attempts",
        headers=headers,
        json={"provider": "azampay"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "billing_invoice_not_payable"


@patch("app.modules.support.admin_router.PlatformERPClient")
def test_admin_can_resync_tenant_invoices_from_platform_erp(platform_client_cls, client, db_session):
    admin, headers = _auth_headers(client, db_session, email="billing-admin@example.com", role="admin")
    owner, _ = _auth_headers(client, db_session, email="billing-resync-owner@example.com")
    tenant, _ = _seed_invoice(db_session, owner=owner, suffix="resync", amount_due=1000, invoice_status="draft")

    db_session.query(BillingInvoice).filter(BillingInvoice.tenant_id == tenant.id).delete()
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.list_invoices.return_value = [
        {
            "name": "SINV-ERP-100",
            "status": "Overdue",
            "outstanding_amount": "1200.00",
            "grand_total": "1500.00",
            "currency": "TZS",
            "due_date": "2026-04-25T00:00:00+00:00",
            "posting_date": "2026-04-20T08:00:00+00:00",
        }
    ]

    response = client.post(f"/admin/billing/tenants/{tenant.id}/resync-invoice", headers=headers)

    assert response.status_code == 200
    assert response.json()["message"] == "Billing invoices resynced."

    invoice = db_session.query(BillingInvoice).filter(BillingInvoice.tenant_id == tenant.id).one()
    assert invoice.erp_invoice_id == "SINV-ERP-100"
    assert invoice.amount_due == 120000
    assert invoice.amount_paid == 30000
    assert invoice.invoice_status == "past_due"

    actions = [row.action for row in db_session.query(AuditLog).filter(AuditLog.actor_id == admin.id).all()]
    assert "admin.resync_billing_invoice" in actions


@patch("app.modules.billing.router.PlatformERPClient")
def test_billing_workspace_route_hydrates_local_invoices_from_platform_erp(platform_client_cls, client, db_session):
    owner, headers = _auth_headers(client, db_session, email="workspace-hydrate-owner@example.com")
    tenant, _ = _seed_invoice(db_session, owner=owner, suffix="hydrate", amount_due=1000, invoice_status="draft")

    db_session.query(BillingInvoice).filter(BillingInvoice.tenant_id == tenant.id).delete()
    db_session.commit()

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.base_url = "https://erp.example.test"
    platform_client.list_invoices.return_value = [
        {
            "name": "SINV-ERP-HYDRATE",
            "status": "Unpaid",
            "outstanding_amount": "800.00",
            "grand_total": "800.00",
            "currency": "TZS",
            "due_date": "2026-04-28T00:00:00+00:00",
            "posting_date": "2026-04-21T08:00:00+00:00",
        }
    ]

    response = client.get(f"/billing/accounts/{tenant.id}", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"]["source"] == "billing_read_model"
    assert payload["openInvoices"][0]["erpInvoiceId"] == "SINV-ERP-HYDRATE"
    assert payload["balance"]["amountDue"] == 80000


@patch("app.modules.tenant.service.get_queue")
@patch(
    "app.modules.billing.router.get_payment_gateway",
    return_value=FakeWebhookGateway(
        event_type="payment.confirmed",
        tenant_id=None,
        subscription_id="attempt-session-webhook-1",
        raw={"transactionId": "attempt-session-webhook-1", "status": "SUCCESS"},
    ),
)
def test_invoice_backed_payment_confirmation_webhook_settles_attempt_and_resumes_lifecycle(_, mock_get_queue, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    owner, _ = _auth_headers(client, db_session, email="invoice-webhook-owner@example.com")
    tenant, invoice = _seed_invoice(db_session, owner=owner, suffix="webhook-confirm")
    attempt = _seed_payment_attempt(
        db_session,
        tenant=tenant,
        invoice=invoice,
        provider_reference="attempt-session-webhook-1",
    )

    response = client.post("/billing/webhook/azampay", json={"status": "SUCCESS"})

    assert response.status_code == 200
    assert response.json()["message"] == "processed:payment.confirmed"

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    refreshed_invoice = db_session.get(BillingInvoice, invoice.id)
    refreshed_attempt = db_session.get(PaymentAttempt, attempt.id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant.id).one()
    jobs = db_session.query(Job).filter(Job.tenant_id == tenant.id, Job.type == "create").all()
    audit_actions = [row.action for row in db_session.query(AuditLog).filter(AuditLog.resource_id == tenant.id).all()]
    billing_events = [row.event_type for row in db_session.query(BillingEvent).filter(BillingEvent.payment_attempt_id == attempt.id).all()]

    assert refreshed_attempt.status == "paid"
    assert refreshed_invoice.amount_due == 0
    assert refreshed_invoice.amount_paid >= 125000
    assert refreshed_invoice.invoice_status == "paid"
    assert refreshed_tenant.status == "pending"
    assert subscription.status == "active"
    assert len(jobs) == 1
    assert jobs[0].rq_job_id == "rq-billing-attempt-1"
    assert "billing.payment_succeeded" in audit_actions
    assert "billing.payment_settled" in billing_events


@patch(
    "app.modules.billing.router.get_payment_gateway",
    return_value=FakeWebhookGateway(
        event_type="payment.failed",
        tenant_id=None,
        subscription_id="attempt-session-webhook-2",
        raw={"transactionId": "attempt-session-webhook-2", "status": "FAILED"},
    ),
)
def test_invoice_backed_payment_failure_webhook_marks_attempt_failed(_, client, db_session):
    owner, _ = _auth_headers(client, db_session, email="invoice-failure-owner@example.com")
    tenant, invoice = _seed_invoice(db_session, owner=owner, suffix="webhook-failed")
    attempt = _seed_payment_attempt(
        db_session,
        tenant=tenant,
        invoice=invoice,
        provider_reference="attempt-session-webhook-2",
    )

    response = client.post("/billing/webhook/azampay", json={"status": "FAILED"})

    assert response.status_code == 200
    assert response.json()["message"] == "processed:payment.failed"

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    refreshed_attempt = db_session.get(PaymentAttempt, attempt.id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant.id).one()
    billing_events = [row.event_type for row in db_session.query(BillingEvent).filter(BillingEvent.payment_attempt_id == attempt.id).all()]

    assert refreshed_attempt.status == "failed"
    assert refreshed_attempt.failure_reason == "FAILED"
    assert refreshed_tenant.status == "pending_payment"
    assert subscription.status == "past_due"
    assert "billing.payment_failed" in billing_events


@patch("app.modules.tenant.service.get_queue")
@patch("app.modules.billing.router.PlatformERPClient")
def test_customer_can_reconcile_paid_invoice_from_platform_erp(platform_client_cls, mock_get_queue, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    owner, headers = _auth_headers(client, db_session, email="invoice-reconcile-owner@example.com")
    tenant, invoice = _seed_invoice(db_session, owner=owner, suffix="reconcile-customer")
    attempt = _seed_payment_attempt(
        db_session,
        tenant=tenant,
        invoice=invoice,
        provider_reference="attempt-session-reconcile-1",
    )

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.runtime_exists.return_value = False
    platform_client.get_invoice.return_value = {
        "name": invoice.erp_invoice_id,
        "status": "Paid",
        "outstanding_amount": "0.00",
        "grand_total": "1250.00",
        "currency": "TZS",
        "due_date": "2026-04-25T00:00:00+00:00",
        "posting_date": "2026-04-20T08:00:00+00:00",
        "paid_at": "2026-04-21T08:00:00+00:00",
    }

    response = client.post(f"/billing/invoice/{invoice.id}/reconcile", headers=headers)

    assert response.status_code == 200
    assert response.json()["message"] == "Billing settlement reconciled."

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    refreshed_invoice = db_session.get(BillingInvoice, invoice.id)
    refreshed_attempt = db_session.get(PaymentAttempt, attempt.id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant.id).one()
    jobs = db_session.query(Job).filter(Job.tenant_id == tenant.id, Job.type == "create").all()
    billing_events = [row.event_type for row in db_session.query(BillingEvent).filter(BillingEvent.billing_invoice_id == invoice.id).all()]
    audit_actions = [row.action for row in db_session.query(AuditLog).filter(AuditLog.resource_id == invoice.id).all()]

    assert refreshed_invoice.invoice_status == "paid"
    assert refreshed_invoice.amount_due == 0
    assert refreshed_attempt.status == "paid"
    assert refreshed_tenant.status == "pending"
    assert subscription.status == "active"
    assert len(jobs) == 1
    assert jobs[0].rq_job_id == "rq-billing-attempt-1"
    assert "billing.payment_reconciled" in billing_events
    assert "billing.invoice_reconciled" in audit_actions


@patch("app.modules.tenant.service.get_queue")
@patch("app.modules.support.admin_router.PlatformERPClient")
def test_admin_can_resync_tenant_settlement_from_platform_erp(platform_client_cls, mock_get_queue, client, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    admin, headers = _auth_headers(client, db_session, email="billing-admin-settlement@example.com", role="admin")
    owner, _ = _auth_headers(client, db_session, email="invoice-resync-settlement-owner@example.com")
    tenant, invoice = _seed_invoice(db_session, owner=owner, suffix="reconcile-admin")
    attempt = _seed_payment_attempt(
        db_session,
        tenant=tenant,
        invoice=invoice,
        provider_reference="attempt-session-reconcile-2",
    )

    platform_client = platform_client_cls.return_value
    platform_client.is_configured.return_value = True
    platform_client.runtime_exists.return_value = False
    platform_client.list_invoices.return_value = [
        {
            "name": invoice.erp_invoice_id,
            "status": "Paid",
            "outstanding_amount": "0.00",
            "grand_total": "1250.00",
            "currency": "TZS",
            "due_date": "2026-04-25T00:00:00+00:00",
            "posting_date": "2026-04-20T08:00:00+00:00",
            "paid_at": "2026-04-21T08:00:00+00:00",
        }
    ]
    platform_client.get_invoice.return_value = platform_client.list_invoices.return_value[0]

    response = client.post(f"/admin/billing/tenants/{tenant.id}/resync-settlement", headers=headers)

    assert response.status_code == 200
    assert response.json()["message"] == "Billing settlement reconciled."

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    refreshed_invoice = db_session.get(BillingInvoice, invoice.id)
    refreshed_attempt = db_session.get(PaymentAttempt, attempt.id)
    subscription = db_session.query(Subscription).filter(Subscription.tenant_id == tenant.id).one()
    audit_actions = [row.action for row in db_session.query(AuditLog).filter(AuditLog.actor_id == admin.id).all()]

    assert refreshed_invoice.invoice_status == "paid"
    assert refreshed_attempt.status == "paid"
    assert refreshed_tenant.status == "pending"
    assert subscription.status == "active"
    assert "admin.resync_billing_settlement" in audit_actions
