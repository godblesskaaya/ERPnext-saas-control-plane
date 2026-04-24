from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.bench.runner import BenchCommandError, BenchResult
from app.models import AuditLog, BillingAccount, BillingEvent, BillingInvoice, Job, PaymentAttempt, Tenant, User
from app.modules.subscription.models import Plan, Subscription
from app.modules.subscription.service import ensure_default_plan_catalog
from app.modules.identity.security import hash_password
from app.workers.tasks import backup_tenant, delete_tenant, provision_tenant, run_billing_dunning_cycle, run_billing_reconciliation_cycle


def _attach_subscription(
    db_session,
    *,
    tenant_id: str,
    plan_slug: str,
    selected_app: str | None = None,
    status: str = "active",
) -> None:
    ensure_default_plan_catalog(db_session)
    db_session.commit()
    plan = db_session.query(Plan).filter(Plan.slug == plan_slug).one()
    db_session.add(
        Subscription(
            tenant_id=tenant_id,
            plan_id=plan.id,
            status=status,
            selected_app=selected_app,
        )
    )
    db_session.commit()


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-001")
def test_worker_provision_flow(_, db_session):
    user = User(email="owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="acme",
        domain="acme.erp.blenkotechnologies.co.tz",
        site_name="acme.erp.blenkotechnologies.co.tz",
        company_name="Acme Ltd",
        plan="starter",
        status="pending",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="create", status="queued")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    provision_tenant(job.id, tenant.id, user.email, "Admin12345")

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    refreshed_job = db_session.get(Job, job.id)
    assert refreshed_tenant.status == "active"
    assert refreshed_tenant.platform_customer_id == "CUST-001"
    assert refreshed_job.status == "succeeded"
    assert "assets-build: MOCK_OK" in refreshed_job.logs

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["tenant.provision_started", "tenant.provision_succeeded"]



def test_worker_backup_and_delete_flow(db_session):
    user = User(email="owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="acme",
        domain="acme.erp.blenkotechnologies.co.tz",
        site_name="acme.erp.blenkotechnologies.co.tz",
        company_name="Acme Ltd",
        plan="starter",
        status="active",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    backup_job = Job(tenant_id=tenant.id, type="backup", status="queued")
    delete_job = Job(tenant_id=tenant.id, type="delete", status="queued")
    db_session.add_all([backup_job, delete_job])
    db_session.commit()
    db_session.refresh(backup_job)
    db_session.refresh(delete_job)

    backup_tenant(backup_job.id, tenant.id)
    delete_tenant(delete_job.id, tenant.id)

    db_session.expire_all()
    assert db_session.get(Job, backup_job.id).status == "succeeded"
    assert db_session.get(Job, delete_job.id).status == "succeeded"
    assert db_session.get(Tenant, tenant.id).status == "deleted"

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["tenant.backup_succeeded", "tenant.delete_completed"]


@patch("app.modules.provisioning.pooled.run_bench_command")
def test_worker_delete_treats_missing_site_as_success(mock_run_bench_command, db_session):
    user = User(email="delete-owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="missing-site",
        domain="missing-site.erp.blenkotechnologies.co.tz",
        site_name="missing-site.erp.blenkotechnologies.co.tz",
        company_name="Missing Site Ltd",
        plan="starter",
        status="pending_deletion",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    delete_job = Job(tenant_id=tenant.id, type="delete", status="queued", logs="Queued tenant deletion")
    db_session.add(delete_job)
    db_session.commit()
    db_session.refresh(delete_job)

    def _run_command(command: list[str]) -> BenchResult:
        if "drop-site" in command:
            raise BenchCommandError(
                BenchResult(
                    command=command,
                    returncode=1,
                    stdout="",
                    stderr=f"404 Not Found: {tenant.domain} does not exist.",
                )
            )
        return BenchResult(command=command, returncode=0, stdout="MOCK_OK", stderr="")

    mock_run_bench_command.side_effect = _run_command

    delete_tenant(delete_job.id, tenant.id)

    db_session.expire_all()
    refreshed_job = db_session.get(Job, delete_job.id)
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    assert refreshed_job is not None
    assert refreshed_tenant is not None
    assert refreshed_job.status == "succeeded"
    assert refreshed_tenant.status == "deleted"
    assert "treating as already deleted" in (refreshed_job.logs or "")

    actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    assert actions == ["tenant.delete_completed"]


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-BIZ")
def test_worker_business_plan_installs_chosen_app(_, db_session):
    user = User(email="biz@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="biz",
        domain="biz.erp.blenkotechnologies.co.tz",
        site_name="biz.erp.blenkotechnologies.co.tz",
        company_name="Biz Ltd",
        plan="business",
        chosen_app="helpdesk",
        status="pending",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    _attach_subscription(
        db_session,
        tenant_id=tenant.id,
        plan_slug="business",
        selected_app="helpdesk",
    )

    job = Job(tenant_id=tenant.id, type="create", status="queued")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    provision_tenant(job.id, tenant.id, user.email, "Admin12345")

    db_session.expire_all()
    refreshed_job = db_session.get(Job, job.id)
    assert "install-app (helpdesk): MOCK_OK" in refreshed_job.logs
    assert refreshed_job.status == "succeeded"


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-ENT")
def test_worker_enterprise_plan_installs_enterprise_pack(_, db_session):
    user = User(email="enterprise@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="enterprise",
        domain="enterprise.erp.blenkotechnologies.co.tz",
        site_name="enterprise.erp.blenkotechnologies.co.tz",
        company_name="Enterprise Ltd",
        plan="enterprise",
        status="pending",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    _attach_subscription(
        db_session,
        tenant_id=tenant.id,
        plan_slug="enterprise",
    )

    job = Job(tenant_id=tenant.id, type="create", status="queued")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    provision_tenant(job.id, tenant.id, user.email, "Admin12345")

    db_session.expire_all()
    refreshed_job = db_session.get(Job, job.id)
    for app_name in ["crm", "hrms", "frappe_whatsapp", "posawesome", "lms", "helpdesk", "payments", "lending"]:
        assert app_name in refreshed_job.logs
    assert refreshed_job.status == "succeeded"


@patch("app.workers.tasks.platform_erp_client.register_customer", return_value="CUST-POD")
@patch("app.modules.provisioning.silo_compose.provision_pod")
def test_worker_enterprise_plan_uses_pod_mode(mock_provision_pod, _, db_session):
    from app.workers import tasks as worker_tasks

    previous_mode = worker_tasks.settings.bench_exec_mode
    worker_tasks.settings.bench_exec_mode = "pod"
    mock_provision_pod.return_value = type(
        "PodResult",
        (),
        {
            "artifact": type(
                "Artifact",
                (),
                {"compose_file": "/opt/erp-pods/enterprise/docker-compose.yml", "project_name": "erp-pod-enterprise"},
            )(),
            "up_command": ["docker", "compose", "-f", "/opt/erp-pods/enterprise/docker-compose.yml", "up", "-d"],
            "health_command": ["docker", "compose", "-f", "/opt/erp-pods/enterprise/docker-compose.yml", "ps", "backend"],
            "up_stdout": "pod up ok",
            "up_stderr": "",
            "health_stdout": "backend running",
            "health_stderr": "",
        },
    )()

    try:
        user = User(email="pod@example.com", password_hash=hash_password("Secret123!"), role="user")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        tenant = Tenant(
            owner_id=user.id,
            subdomain="enterprise-pod",
            domain="enterprise-pod.erp.blenkotechnologies.co.tz",
            site_name="enterprise-pod.erp.blenkotechnologies.co.tz",
            company_name="Enterprise Pod Ltd",
            plan="enterprise",
            status="pending",
        )
        db_session.add(tenant)
        db_session.commit()
        db_session.refresh(tenant)
        ensure_default_plan_catalog(db_session)
        db_session.commit()
        enterprise_plan = db_session.query(Plan).filter(Plan.slug == "enterprise").one()
        db_session.add(Subscription(tenant_id=tenant.id, plan_id=enterprise_plan.id, status="active"))
        db_session.commit()

        job = Job(tenant_id=tenant.id, type="create", status="queued")
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)

        provision_tenant(job.id, tenant.id, user.email, "Admin12345")

        db_session.expire_all()
        refreshed_job = db_session.get(Job, job.id)
        assert "pod-compose" in refreshed_job.logs
        assert refreshed_job.status == "succeeded"
        mock_provision_pod.assert_called_once()
    finally:
        worker_tasks.settings.bench_exec_mode = previous_mode


@patch("app.workers.tasks.notification_service.send")
@patch("app.workers.tasks.platform_erp_client.runtime_exists")
def test_worker_billing_dunning_skips_deleted_and_runtime_missing_tenants(mock_runtime_exists, mock_send, db_session):
    user = User(email="billing-owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    pending_payment = Tenant(
        owner_id=user.id,
        subdomain="pending-payment",
        domain="pending-payment.erp.blenkotechnologies.co.tz",
        site_name="pending-payment.erp.blenkotechnologies.co.tz",
        company_name="Pending Payment Ltd",
        plan="starter",
        status="pending_payment",
        updated_at=datetime.now(timezone.utc) - timedelta(hours=7),
    )
    runtime_missing = Tenant(
        owner_id=user.id,
        subdomain="runtime-missing",
        domain="runtime-missing.erp.blenkotechnologies.co.tz",
        site_name="runtime-missing.erp.blenkotechnologies.co.tz",
        company_name="Runtime Missing Ltd",
        plan="starter",
        status="suspended_billing",
        updated_at=datetime.now(timezone.utc) - timedelta(hours=13),
    )
    deleted = Tenant(
        owner_id=user.id,
        subdomain="deleted-dunning",
        domain="deleted-dunning.erp.blenkotechnologies.co.tz",
        site_name="deleted-dunning.erp.blenkotechnologies.co.tz",
        company_name="Deleted Dunning Ltd",
        plan="starter",
        status="deleted",
        updated_at=datetime.now(timezone.utc) - timedelta(days=2),
    )
    db_session.add_all([pending_payment, runtime_missing, deleted])
    db_session.commit()
    db_session.refresh(pending_payment)
    db_session.refresh(runtime_missing)
    db_session.refresh(deleted)

    _attach_subscription(db_session, tenant_id=pending_payment.id, plan_slug="starter", status="pending")
    _attach_subscription(db_session, tenant_id=runtime_missing.id, plan_slug="starter", status="paused")
    _attach_subscription(db_session, tenant_id=deleted.id, plan_slug="starter", status="pending")

    mock_runtime_exists.side_effect = lambda runtime_name: runtime_name != runtime_missing.site_name

    run_billing_dunning_cycle()

    assert mock_send.call_count == 1
    sent_message = mock_send.call_args.args[0]
    assert sent_message.to_email == user.email
    assert pending_payment.domain in sent_message.subject

    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "billing.dunning_cycle_completed")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert audit is not None
    assert audit.metadata_json["flagged"] == 1
    assert audit.metadata_json["skipped_missing_runtime"] == 1


@patch("app.workers.tasks.notification_service.send_tenant_suspended")
@patch("app.workers.tasks.notification_service.send")
@patch("app.workers.tasks.platform_erp_client.runtime_exists")
def test_worker_billing_dunning_does_not_suspend_missing_runtime_pending_payment(
    mock_runtime_exists,
    mock_send,
    mock_send_tenant_suspended,
    db_session,
):
    user = User(email="billing-runtime-gap@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="pending-gap",
        domain="pending-gap.erp.blenkotechnologies.co.tz",
        site_name="pending-gap.erp.blenkotechnologies.co.tz",
        company_name="Pending Gap Ltd",
        plan="starter",
        status="pending_payment",
        updated_at=datetime.now(timezone.utc) - timedelta(days=4),
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    _attach_subscription(db_session, tenant_id=tenant.id, plan_slug="starter", status="pending")
    mock_runtime_exists.return_value = False

    run_billing_dunning_cycle()

    db_session.expire_all()
    refreshed = db_session.get(Tenant, tenant.id)
    assert refreshed is not None
    assert refreshed.status == "pending_payment"
    assert mock_send_tenant_suspended.call_count == 0

    escalation_audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "billing.dunning_escalated", AuditLog.resource_id == tenant.id)
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert escalation_audit is None
    assert mock_send.call_count == 1



class DummyRQJob:
    id = "rq-billing-reconcile-1"



def fake_enqueue(*args, **kwargs):
    return DummyRQJob()


@patch("app.modules.tenant.service.get_queue")
@patch("app.modules.billing.reconciliation.PlatformERPClient")
def test_worker_billing_reconciliation_cycle_repairs_paid_invoice_and_requeues_provisioning(platform_client_cls, mock_get_queue, db_session):
    mock_get_queue.return_value.enqueue = fake_enqueue
    user = User(email="reconcile-owner@example.com", password_hash=hash_password("Secret123!"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="reconcile-cycle",
        domain="reconcile-cycle.erp.blenkotechnologies.co.tz",
        site_name="reconcile-cycle.erp.blenkotechnologies.co.tz",
        company_name="Reconcile Cycle Ltd",
        plan="starter",
        status="pending_payment",
        payment_provider="azampay",
        platform_customer_id="ERP-CUST-RECON",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    _attach_subscription(db_session, tenant_id=tenant.id, plan_slug="starter", status="pending")

    account = BillingAccount(
        tenant_id=tenant.id,
        customer_id=user.id,
        erp_customer_id=tenant.platform_customer_id,
        currency="TZS",
        status="linked",
    )
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)

    invoice = BillingInvoice(
        tenant_id=tenant.id,
        subscription_id=tenant.subscription.id,
        billing_account_id=account.id,
        erp_invoice_id="SINV-RECON-1",
        invoice_number="SINV-RECON-1",
        amount_due=125000,
        amount_paid=0,
        currency="TZS",
        invoice_status="payment_pending",
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)

    attempt = PaymentAttempt(
        tenant_id=tenant.id,
        subscription_id=tenant.subscription.id,
        billing_invoice_id=invoice.id,
        provider="azampay",
        provider_reference="attempt-recon-1",
        amount=125000,
        currency="TZS",
        status="checkout_started",
        checkout_url="https://payments.example.com/attempt-recon-1",
        provider_payload_snapshot={"invoice_id": invoice.id},
        provider_response_snapshot={"session_id": "attempt-recon-1"},
    )
    db_session.add(attempt)
    db_session.commit()
    db_session.refresh(attempt)

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

    run_billing_reconciliation_cycle()

    db_session.expire_all()
    refreshed_tenant = db_session.get(Tenant, tenant.id)
    refreshed_invoice = db_session.get(BillingInvoice, invoice.id)
    refreshed_attempt = db_session.get(PaymentAttempt, attempt.id)
    jobs = db_session.query(Job).filter(Job.tenant_id == tenant.id, Job.type == "create").all()
    audit_actions = [row.action for row in db_session.query(AuditLog).order_by(AuditLog.created_at.asc()).all()]
    billing_events = [row.event_type for row in db_session.query(BillingEvent).filter(BillingEvent.billing_invoice_id == invoice.id).all()]

    assert refreshed_tenant.subscription.status == "active"
    assert refreshed_tenant.status == "pending"
    assert refreshed_invoice.invoice_status == "paid"
    assert refreshed_invoice.amount_due == 0
    assert refreshed_attempt.status == "paid"
    assert len(jobs) == 1
    assert jobs[0].rq_job_id == "rq-billing-reconcile-1"
    assert "billing.payment_reconciled" in billing_events
    assert "billing.reconciliation_cycle_completed" in audit_actions
