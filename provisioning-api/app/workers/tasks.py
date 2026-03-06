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
from app.logging_config import get_logger
from app.models import Job, Tenant, User
from app.schemas import BillingPayload
from app.services.audit_service import record_audit_event
from app.services.backup_service import persist_backup_manifest
from app.services.billing_client import BillingClient
from app.services.job_service import append_log, mark_job_failed, mark_job_running, mark_job_success
from app.services.notifications import notification_service
from app.services.tenant_state import InvalidTenantStatusTransition, transition_tenant_status


billing_client = BillingClient()
log = get_logger(__name__)


def _load_entities(db, job_id: str, tenant_id: str) -> tuple[Job, Tenant]:
    job = db.get(Job, job_id)
    tenant = db.get(Tenant, tenant_id)
    if not job or not tenant:
        raise RuntimeError("Job or tenant not found")
    return job, tenant


def provision_tenant(job_id: str, tenant_id: str, owner_email: str, admin_password: str) -> None:
    db = SessionLocal()
    task_log = log.bind(task="provision_tenant", job_id=job_id, tenant_id=tenant_id)
    task_log.info("tenant.provision.start")
    try:
        job, tenant = _load_entities(db, job_id, tenant_id)
        task_log = task_log.bind(domain=tenant.domain, subdomain=tenant.subdomain)
        mark_job_running(db, job)

        transition_tenant_status(tenant, "provisioning")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        record_audit_event(
            db,
            action="tenant.provision_started",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id},
        )

        db_name = f"site_{tenant.subdomain.replace('-', '_')}"

        new_site_res = run_bench_command(build_new_site_command(tenant.domain, admin_password, db_name))
        append_log(job, f"new-site: {new_site_res.stdout.strip()}")
        task_log.info(
            "tenant.provision.new_site_completed",
            command=new_site_res.command,
            returncode=new_site_res.returncode,
        )

        install_res = run_bench_command(build_install_app_command(tenant.domain, "erpnext"))
        append_log(job, f"install-app: {install_res.stdout.strip()}")
        task_log.info(
            "tenant.provision.install_app_completed",
            command=install_res.command,
            returncode=install_res.returncode,
        )

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
        transition_tenant_status(tenant, "active")
        tenant.updated_at = datetime.utcnow()
        db.add(tenant)

        db.add(job)
        db.commit()
        db.refresh(job)
        mark_job_success(db, job)
        record_audit_event(
            db,
            action="tenant.provision_succeeded",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "platform_customer_id": customer_id},
        )
        task_log.info("tenant.provision.succeeded", platform_customer_id=customer_id)
        notification_service.send_provisioning_complete(owner_email, tenant.domain)
    except BenchCommandError as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, exc.result.stdout)
        append_log(job, exc.result.stderr)
        transition_tenant_status(tenant, "failed")
        db.add(tenant)
        db.commit()
        mark_job_failed(db, job, f"Bench command failed: {exc.result.stderr or exc.result.stdout}")
        record_audit_event(
            db,
            action="tenant.provision_failed",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "error": exc.result.stderr or exc.result.stdout},
        )
        task_log.error(
            "tenant.provision.bench_failed",
            command=exc.result.command,
            stderr=exc.result.stderr,
            stdout=exc.result.stdout,
        )
        notification_service.send_provisioning_failed(
            owner_email,
            tenant.domain,
            exc.result.stderr or exc.result.stdout or "Bench command failed",
        )
    except Exception as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, traceback.format_exc())
        transition_tenant_status(tenant, "failed")
        db.add(tenant)
        db.commit()
        mark_job_failed(db, job, str(exc))
        record_audit_event(
            db,
            action="tenant.provision_failed",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "error": str(exc)},
        )
        task_log.exception("tenant.provision.failed")
        notification_service.send_provisioning_failed(owner_email, tenant.domain, str(exc))
    finally:
        db.close()


def backup_tenant(job_id: str, tenant_id: str) -> None:
    db = SessionLocal()
    task_log = log.bind(task="backup_tenant", job_id=job_id, tenant_id=tenant_id)
    task_log.info("tenant.backup.start")
    try:
        job, tenant = _load_entities(db, job_id, tenant_id)
        task_log = task_log.bind(domain=tenant.domain, subdomain=tenant.subdomain)
        mark_job_running(db, job)

        result = run_bench_command(build_backup_command(tenant.domain))
        manifest = persist_backup_manifest(db, tenant=tenant, job=job, bench_stdout=result.stdout)
        append_log(job, f"backup: {result.stdout.strip()}")
        append_log(
            job,
            "backup manifest: "
            f"path={manifest.file_path} size={manifest.file_size_bytes} "
            f"s3_key={manifest.s3_key or '-'} expires_at={manifest.expires_at.isoformat()}",
        )
        db.add(job)
        db.commit()
        mark_job_success(db, job)
        record_audit_event(
            db,
            action="tenant.backup_succeeded",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={
                "job_id": job.id,
                "backup_id": manifest.id,
                "file_path": manifest.file_path,
                "file_size_bytes": manifest.file_size_bytes,
                "expires_at": manifest.expires_at.isoformat(),
                "s3_key": manifest.s3_key,
            },
        )
        task_log.info(
            "tenant.backup.succeeded",
            command=result.command,
            returncode=result.returncode,
            backup_id=manifest.id,
            file_path=manifest.file_path,
            file_size_bytes=manifest.file_size_bytes,
            s3_key=manifest.s3_key,
        )
        owner = db.get(User, tenant.owner_id)
        if owner:
            notification_service.send_backup_succeeded(owner.email, tenant.domain, manifest.file_size_bytes)
    except Exception as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, traceback.format_exc())
        db.add(job)
        db.commit()
        mark_job_failed(db, job, str(exc))
        record_audit_event(
            db,
            action="tenant.backup_failed",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "error": str(exc)},
        )
        task_log.exception("tenant.backup.failed")
    finally:
        db.close()


def delete_tenant(job_id: str, tenant_id: str) -> None:
    db = SessionLocal()
    task_log = log.bind(task="delete_tenant", job_id=job_id, tenant_id=tenant_id)
    task_log.info("tenant.delete.start")
    try:
        job, tenant = _load_entities(db, job_id, tenant_id)
        task_log = task_log.bind(domain=tenant.domain, subdomain=tenant.subdomain)
        mark_job_running(db, job)
        if tenant.status != "deleting":
            transition_tenant_status(tenant, "deleting")
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        result = run_bench_command(build_delete_site_command(tenant.domain))
        append_log(job, f"delete: {result.stdout.strip()}")

        transition_tenant_status(tenant, "deleted")
        tenant.updated_at = datetime.utcnow()
        db.add(tenant)
        db.add(job)
        db.commit()

        mark_job_success(db, job)
        record_audit_event(
            db,
            action="tenant.delete_completed",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id},
        )
        task_log.info("tenant.delete.succeeded", command=result.command, returncode=result.returncode)
        owner = db.get(User, tenant.owner_id)
        if owner:
            notification_service.send_tenant_deleted(owner.email, tenant.domain)
    except InvalidTenantStatusTransition as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, f"State transition error: {exc}")
        mark_job_failed(db, job, str(exc))
        task_log.error("tenant.delete.transition_failed", error=str(exc), tenant_status=tenant.status)
    except Exception as exc:
        job, tenant = _load_entities(db, job_id, tenant_id)
        append_log(job, traceback.format_exc())
        transition_tenant_status(tenant, "failed")
        db.add(tenant)
        db.add(job)
        db.commit()
        mark_job_failed(db, job, str(exc))
        record_audit_event(
            db,
            action="tenant.delete_failed",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "error": str(exc)},
        )
        task_log.exception("tenant.delete.failed")
    finally:
        db.close()
