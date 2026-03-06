from __future__ import annotations

import traceback
from datetime import datetime

from app.bench.commands import (
    build_backup_command,
    build_delete_site_command,
    build_install_app_command,
    build_new_site_command,
)
from app.bench.runner import BenchCommandError, run_bench_command
from app.db import SessionLocal
from app.models import Job, Tenant, User
from app.schemas import BillingPayload
from app.services.billing_client import BillingClient
from app.services.job_service import append_log, mark_job_failed, mark_job_running, mark_job_success


billing_client = BillingClient()


def _load_entities(db, job_id: str, tenant_id: str) -> tuple[Job, Tenant]:
    job = db.get(Job, job_id)
    tenant = db.get(Tenant, tenant_id)
    if not job or not tenant:
        raise RuntimeError("Job or tenant not found")
    return job, tenant


def provision_tenant(job_id: str, tenant_id: str, owner_email: str, admin_password: str) -> None:
    db = SessionLocal()
    try:
        job, tenant = _load_entities(db, job_id, tenant_id)
        mark_job_running(db, job)

        tenant.status = "provisioning"
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

        db_name = f"site_{tenant.subdomain.replace('-', '_')}"

        new_site_res = run_bench_command(build_new_site_command(tenant.domain, admin_password, db_name))
        append_log(job, f"new-site: {new_site_res.stdout.strip()}")

        install_res = run_bench_command(build_install_app_command(tenant.domain, "erpnext"))
        append_log(job, f"install-app: {install_res.stdout.strip()}")

        billing_payload = BillingPayload(
            tenant_id=tenant.id,
            domain=tenant.domain,
            company_name=tenant.company_name,
            plan=tenant.plan,
            owner_email=owner_email,
        )
        customer_id = billing_client.register_customer(billing_payload)
        append_log(job, f"billing: customer={customer_id}")

        tenant.platform_customer_id = customer_id
        tenant.status = "active"
        tenant.updated_at = datetime.utcnow()
        db.add(tenant)

        db.add(job)
        db.commit()
        db.refresh(job)
        mark_job_success(db, job)
    except BenchCommandError as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, exc.result.stdout)
        append_log(job, exc.result.stderr)
        tenant.status = "failed"
        db.add(tenant)
        db.commit()
        mark_job_failed(db, job, f"Bench command failed: {exc.result.stderr or exc.result.stdout}")
    except Exception as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, traceback.format_exc())
        tenant.status = "failed"
        db.add(tenant)
        db.commit()
        mark_job_failed(db, job, str(exc))
    finally:
        db.close()


def backup_tenant(job_id: str, tenant_id: str) -> None:
    db = SessionLocal()
    try:
        job, tenant = _load_entities(db, job_id, tenant_id)
        mark_job_running(db, job)

        result = run_bench_command(build_backup_command(tenant.domain))
        append_log(job, f"backup: {result.stdout.strip()}")
        db.add(job)
        db.commit()
        mark_job_success(db, job)
    except Exception as exc:
        job, _ = _load_entities(db, job_id, tenant_id)
        append_log(job, traceback.format_exc())
        db.add(job)
        db.commit()
        mark_job_failed(db, job, str(exc))
    finally:
        db.close()


def delete_tenant(job_id: str, tenant_id: str) -> None:
    db = SessionLocal()
    try:
        job, tenant = _load_entities(db, job_id, tenant_id)
        mark_job_running(db, job)

        result = run_bench_command(build_delete_site_command(tenant.domain))
        append_log(job, f"delete: {result.stdout.strip()}")

        tenant.status = "deleted"
        tenant.updated_at = datetime.utcnow()
        db.add(tenant)
        db.add(job)
        db.commit()

        mark_job_success(db, job)
    except Exception as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, traceback.format_exc())
        tenant.status = "failed"
        db.add(tenant)
        db.add(job)
        db.commit()
        mark_job_failed(db, job, str(exc))
    finally:
        db.close()
