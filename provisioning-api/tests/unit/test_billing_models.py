from __future__ import annotations

from app.models import User
from app.modules.billing.models import BillingAccount, BillingEvent, BillingException, BillingInvoice, PaymentAttempt
from app.modules.subscription.models import Plan, Subscription
from app.modules.tenant.models import Tenant


def test_billing_tables_are_registered_in_metadata() -> None:
    table_names = {
        "billing_accounts",
        "billing_invoices",
        "payment_attempts",
        "billing_events",
        "billing_exceptions",
    }

    assert table_names.issubset(set(BillingAccount.metadata.tables))


def test_billing_models_persist_and_link(db_session) -> None:
    owner = User(id="user-1", email="billing-owner@example.com", password_hash="hashed")
    tenant = Tenant(
        id="tenant-1",
        owner=owner,
        subdomain="billing-models",
        domain="billing-models.erp.blenkotechnologies.co.tz",
        site_name="billing-models.erp.blenkotechnologies.co.tz",
        company_name="Billing Models Ltd",
        status="pending_payment",
        payment_provider="azampay",
        billing_status="failed",
    )
    plan = Plan(
        id="plan-1",
        slug="starter",
        display_name="Starter",
        is_active=True,
        isolation_model="pooled",
        max_extra_apps=0,
        monthly_price_usd_cents=4900,
        monthly_price_tzs=125000,
        stripe_price_id="starter_monthly",
        dpo_product_code="starter",
        backup_frequency="weekly",
        backup_retention_days=7,
        includes_s3_offsite_backup=False,
        support_channel="email",
        sla_enabled=False,
        custom_domain_enabled=False,
    )
    subscription = Subscription(id="sub-1", tenant=tenant, plan=plan, status="past_due")
    account = BillingAccount(id="acct-1", tenant=tenant, customer_id="user-1", erp_customer_id="CUST-1", currency="TZS", status="linked")
    invoice = BillingInvoice(id="inv-1", 
        tenant=tenant,
        subscription=subscription,
        billing_account=account,
        erp_invoice_id="ACC-SINV-2026-0001",
        invoice_number="ACC-SINV-2026-0001",
        amount_due=125000,
        amount_paid=0,
        currency="TZS",
        invoice_status="past_due",
        collection_stage="overdue_1",
    )
    attempt = PaymentAttempt(id="attempt-1", 
        tenant=tenant,
        subscription=subscription,
        billing_invoice=invoice,
        provider="azampay",
        provider_reference="AZM-001",
        amount=125000,
        currency="TZS",
        status="failed",
        failure_reason="declined",
        provider_payload_snapshot={"channel": "mobile_money"},
        provider_response_snapshot={"status": "FAILED"},
    )
    event = BillingEvent(
        tenant_id=tenant.id,
        subscription_id=subscription.id,
        billing_invoice_id=invoice.id,
        payment_attempt_id=attempt.id,
        event_type="billing.payment_failed",
        event_source="provider_webhook",
        metadata_json={"provider": "azampay"},
    )
    exception = BillingException(
        tenant_id=tenant.id,
        subscription_id=subscription.id,
        billing_invoice_id=invoice.id,
        payment_attempt_id=attempt.id,
        exception_type="reconciliation_required",
        reason="Provider callback missing settlement confirmation",
        details_json={"provider": "azampay"},
    )

    db_session.add_all([owner, tenant, plan, subscription, account, invoice, attempt])
    db_session.flush()
    db_session.add_all([event, exception])
    db_session.commit()

    stored_invoice = db_session.get(BillingInvoice, invoice.id)
    stored_attempt = db_session.get(PaymentAttempt, attempt.id)
    stored_event = db_session.get(BillingEvent, event.id)
    stored_exception = db_session.get(BillingException, exception.id)

    assert stored_invoice is not None
    assert stored_invoice.billing_account_id == account.id
    assert stored_invoice.subscription_id == subscription.id
    assert stored_attempt is not None
    assert stored_attempt.billing_invoice_id == invoice.id
    assert stored_event is not None
    assert stored_event.payment_attempt_id == attempt.id
    assert stored_exception is not None
    assert stored_exception.billing_invoice_id == invoice.id
