from __future__ import annotations

import traceback

from sqlalchemy import or_

from app.bench.commands import (
    build_assets_command,
    build_backup_command,
    build_delete_site_command,
    build_install_app_command,
    build_new_site_command,
    build_restore_command,
)
from app.bench.runner import BenchCommandError, run_bench_command
from app.config import get_settings
from app.db import SessionLocal
from app.logging_config import get_logger
from app.models import BackupManifest, Job, Tenant, User
from app.schemas import BillingPayload
from app.domains.audit.service import record_audit_event
from app.domains.support.dunning import resolve_dunning_context
from app.domains.tenants.backup_service import persist_backup_manifest
from app.domains.support.job_service import append_log, mark_job_failed, mark_job_running, mark_job_success
from app.domains.support.notifications import NotificationMessage, notification_service
from app.domains.support.platform_erp_client import PlatformERPClient
from app.domains.tenants.tls_sync import sync_tenant_tls_routes
from app.domains.tenants.state import InvalidTenantStatusTransition, transition_tenant_status
from app.utils.time import utcnow


platform_erp_client = PlatformERPClient()
log = get_logger(__name__)
settings = get_settings()
ENTERPRISE_APPS = [
    "crm",
    "hrms",
    "frappe_whatsapp",
    "posawesome",
    "lms",
    "helpdesk",
    "payments",
    "lending",
]


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

        if tenant.plan == "enterprise" and settings.bench_exec_mode == "pod":
            from app.bench.pod.runner import provision_pod

            pod_result = provision_pod(tenant, admin_password)
            append_log(job, f"pod-compose: {pod_result.artifact.compose_file}")
            append_log(job, f"pod-up-cmd: {' '.join(pod_result.up_command)}")
            append_log(job, f"pod-up: {pod_result.up_stdout.strip() or 'OK'}")
            if pod_result.up_stderr.strip():
                append_log(job, f"pod-up-stderr: {pod_result.up_stderr.strip()}")
            append_log(job, f"pod-health-cmd: {' '.join(pod_result.health_command)}")
            append_log(job, f"pod-health: {pod_result.health_stdout.strip() or 'OK'}")
            if pod_result.health_stderr.strip():
                append_log(job, f"pod-health-stderr: {pod_result.health_stderr.strip()}")
            task_log.info(
                "tenant.provision.pod_completed",
                compose_file=str(pod_result.artifact.compose_file),
                project=str(pod_result.artifact.project_name),
            )
        else:
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

            if tenant.plan == "business" and tenant.chosen_app:
                business_install = run_bench_command(build_install_app_command(tenant.domain, tenant.chosen_app))
                append_log(job, f"install-app ({tenant.chosen_app}): {business_install.stdout.strip()}")
                task_log.info(
                    "tenant.provision.install_business_app_completed",
                    app=tenant.chosen_app,
                    command=business_install.command,
                    returncode=business_install.returncode,
                )
            elif tenant.plan == "enterprise":
                for app_name in ENTERPRISE_APPS:
                    enterprise_install = run_bench_command(build_install_app_command(tenant.domain, app_name))
                    append_log(job, f"install-app ({app_name}): {enterprise_install.stdout.strip()}")
                    task_log.info(
                        "tenant.provision.install_enterprise_app_completed",
                        app=app_name,
                        command=enterprise_install.command,
                        returncode=enterprise_install.returncode,
                    )

            if settings.bench_build_assets_after_provision:
                assets_res = run_bench_command(build_assets_command(force=True))
                append_log(job, f"assets-build: {assets_res.stdout.strip()}")
                task_log.info(
                    "tenant.provision.assets_build_completed",
                    command=assets_res.command,
                    returncode=assets_res.returncode,
                )

        billing_payload = BillingPayload(
            tenant_id=tenant.id,
            domain=tenant.domain,
            company_name=tenant.company_name,
            plan=tenant.plan,
            owner_email=owner_email,
        )
        customer_id = platform_erp_client.register_customer(billing_payload)
        append_log(job, f"billing: customer={customer_id}")

        tenant.platform_customer_id = customer_id
        transition_tenant_status(tenant, "active")
        tenant.updated_at = utcnow()
        db.add(tenant)

        db.add(job)
        db.commit()
        db.refresh(job)
        mark_job_success(db, job)

        tls_sync = sync_tenant_tls_routes(prime_certs=settings.tenant_tls_sync_prime_on_provision)
        if tls_sync.attempted:
            append_log(job, f"tls-sync: {tls_sync.message}")
        elif not tls_sync.succeeded:
            append_log(job, f"tls-sync-warning: {tls_sync.message}")

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
        tenant.updated_at = utcnow()
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
        tls_sync = sync_tenant_tls_routes(prime_certs=False)
        if tls_sync.attempted:
            append_log(job, f"tls-sync: {tls_sync.message}")
        elif not tls_sync.succeeded:
            append_log(job, f"tls-sync-warning: {tls_sync.message}")
        db.add(job)
        db.commit()
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


def _resolve_restore_path(manifest: BackupManifest) -> str:
    if manifest.s3_key and settings.backup_s3_bucket:
        try:
            import boto3  # type: ignore
        except ModuleNotFoundError as exc:
            raise RuntimeError("boto3 is required to download backups from S3") from exc
        client_kwargs = {}
        if settings.backup_s3_region:
            client_kwargs["region_name"] = settings.backup_s3_region
        client = boto3.client("s3", **client_kwargs)
        target_path = f"/tmp/restore-{manifest.id}"
        client.download_file(settings.backup_s3_bucket, manifest.s3_key, target_path)
        return target_path

    if not manifest.file_path:
        raise RuntimeError("Backup file path is missing")
    return manifest.file_path


def restore_tenant(job_id: str, tenant_id: str, backup_id: str) -> None:
    db = SessionLocal()
    task_log = log.bind(task="restore_tenant", job_id=job_id, tenant_id=tenant_id)
    task_log.info("tenant.restore.start")
    restore_path = None
    try:
        job, tenant = _load_entities(db, job_id, tenant_id)
        task_log = task_log.bind(domain=tenant.domain, subdomain=tenant.subdomain)
        mark_job_running(db, job)

        transition_tenant_status(tenant, "restoring")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        record_audit_event(
            db,
            action="tenant.restore_started",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "backup_id": backup_id},
        )

        manifest = db.get(BackupManifest, backup_id)
        if not manifest or manifest.tenant_id != tenant.id:
            raise RuntimeError("Backup manifest not found for tenant")

        restore_path = _resolve_restore_path(manifest)
        result = run_bench_command(build_restore_command(tenant.domain, restore_path))
        append_log(job, f"restore: {result.stdout.strip()}")

        transition_tenant_status(tenant, "active")
        tenant.updated_at = utcnow()
        db.add(tenant)
        db.add(job)
        db.commit()

        mark_job_success(db, job)
        record_audit_event(
            db,
            action="tenant.restore_succeeded",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "backup_id": backup_id},
        )
        task_log.info("tenant.restore.succeeded", command=result.command, returncode=result.returncode)
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
            action="tenant.restore_failed",
            resource="tenants",
            actor_role="system",
            resource_id=tenant.id,
            metadata={"job_id": job.id, "backup_id": backup_id, "error": str(exc)},
        )
        task_log.exception("tenant.restore.failed")
    finally:
        if restore_path and restore_path.startswith("/tmp/restore-"):
            try:
                import os

                os.remove(restore_path)
            except Exception:
                pass
        db.close()


def _trim_output(value: str, limit: int = 4000) -> str:
    cleaned = (value or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit]}…(truncated)"


def rebuild_platform_assets(admin_id: str | None = None) -> None:
    db = SessionLocal()
    task_log = log.bind(task="rebuild_platform_assets", actor_id=admin_id)
    task_log.info("maintenance.assets_build.start")
    admin = db.get(User, admin_id) if admin_id else None
    try:
        assets_res = run_bench_command(build_assets_command(force=True))
        record_audit_event(
            db,
            action="maintenance.assets_build_completed",
            resource="platform",
            actor=admin,
            metadata={"stdout": _trim_output(assets_res.stdout)},
        )
        task_log.info("maintenance.assets_build.completed", stdout=_trim_output(assets_res.stdout))
    except BenchCommandError as exc:
        record_audit_event(
            db,
            action="maintenance.assets_build_failed",
            resource="platform",
            actor=admin,
            metadata={
                "stdout": _trim_output(exc.result.stdout),
                "stderr": _trim_output(exc.result.stderr),
                "command": " ".join(exc.result.command),
            },
        )
        task_log.error(
            "maintenance.assets_build.failed",
            command=exc.result.command,
            stderr=_trim_output(exc.result.stderr),
            stdout=_trim_output(exc.result.stdout),
        )
        raise
    finally:
        db.close()


def sync_tenant_tls_routes_task(admin_id: str | None = None, prime_certs: bool = False) -> None:
    db = SessionLocal()
    task_log = log.bind(task="sync_tenant_tls_routes", actor_id=admin_id, prime_certs=prime_certs)
    task_log.info("maintenance.tls_sync.start")
    admin = db.get(User, admin_id) if admin_id else None
    try:
        result = sync_tenant_tls_routes(prime_certs=prime_certs)
        action = "maintenance.tls_sync_completed" if result.succeeded else "maintenance.tls_sync_failed"
        record_audit_event(
            db,
            action=action,
            resource="platform",
            actor=admin,
            metadata={"result": result.message, "prime_certs": prime_certs},
        )
        task_log.info("maintenance.tls_sync.completed", result=result.message, succeeded=result.succeeded)
        if not result.succeeded:
            raise RuntimeError(result.message)
    finally:
        db.close()


def run_billing_dunning_cycle(admin_id: str | None = None, dry_run: bool = False) -> None:
    db = SessionLocal()
    task_log = log.bind(task="run_billing_dunning_cycle", actor_id=admin_id, dry_run=dry_run)
    task_log.info("billing.dunning_cycle.start")
    admin = db.get(User, admin_id) if admin_id else None
    now = utcnow()
    summary = {
        "flagged": 0,
        "due_for_retry": 0,
        "due_for_escalation": 0,
        "reminders_sent": 0,
        "escalated": 0,
        "dry_run": dry_run,
    }

    try:
        flagged = (
            db.query(Tenant)
            .filter(
                or_(
                    Tenant.status.in_(["pending_payment", "suspended_billing"]),
                    Tenant.billing_status.in_(["failed", "past_due", "unpaid", "cancelled"]),
                )
            )
            .order_by(Tenant.updated_at.asc())
            .all()
        )
        summary["flagged"] = len(flagged)

        for tenant in flagged:
            owner = db.get(User, tenant.owner_id) if tenant.owner_id else None
            context = resolve_dunning_context(tenant, platform_erp_client)
            due_for_retry = bool(context.next_retry_at and context.next_retry_at <= now)
            due_for_escalation = bool(context.grace_ends_at and context.grace_ends_at <= now)

            if due_for_retry:
                summary["due_for_retry"] += 1
                if not dry_run:
                    if owner:
                        invoice_hint = context.last_invoice_id or "latest outstanding invoice"
                        invoice_url = context.invoice_url or "https://erp.blenkotechnologies.co.tz/billing"
                        sent = notification_service.send(
                            NotificationMessage(
                                to_email=owner.email,
                                subject=f"Payment reminder for {tenant.domain}",
                                text=(
                                    f"Your workspace {tenant.domain} requires payment follow-up.\n\n"
                                    f"Invoice: {invoice_hint}\n"
                                    f"Open billing: {invoice_url}\n\n"
                                    "Please complete payment to avoid service suspension."
                                ),
                            )
                        )
                        if sent:
                            summary["reminders_sent"] += 1
                    tenant.updated_at = now
                    db.add(tenant)
                    record_audit_event(
                        db,
                        action="billing.dunning_retry_due",
                        resource="tenants",
                        actor=admin,
                        actor_role="system" if admin is None else None,
                        resource_id=tenant.id,
                        metadata={
                            "next_retry_at": context.next_retry_at.isoformat() if context.next_retry_at else None,
                            "last_invoice_id": context.last_invoice_id,
                            "dry_run": dry_run,
                        },
                    )

            if (
                due_for_escalation
                and tenant.status not in {"suspended_billing", "deleted", "deleting", "pending_deletion"}
                and (tenant.billing_status or "").lower() != "paid"
            ):
                summary["due_for_escalation"] += 1
                if not dry_run:
                    try:
                        transition_tenant_status(tenant, "suspended_billing")
                    except InvalidTenantStatusTransition:
                        tenant.status = "suspended_billing"
                    tenant.updated_at = now
                    db.add(tenant)
                    summary["escalated"] += 1
                    record_audit_event(
                        db,
                        action="billing.dunning_escalated",
                        resource="tenants",
                        actor=admin,
                        actor_role="system" if admin is None else None,
                        resource_id=tenant.id,
                        metadata={
                            "grace_ends_at": context.grace_ends_at.isoformat() if context.grace_ends_at else None,
                            "last_invoice_id": context.last_invoice_id,
                            "dry_run": dry_run,
                        },
                    )
                    if owner:
                        notification_service.send_tenant_suspended(
                            owner.email,
                            tenant.domain,
                            "Payment grace period ended",
                        )

        record_audit_event(
            db,
            action="billing.dunning_cycle_completed",
            resource="billing",
            actor=admin,
            actor_role="system" if admin is None else None,
            metadata=summary,
        )
        if not dry_run:
            db.commit()
        task_log.info("billing.dunning_cycle.completed", **summary)
    except Exception:
        if not dry_run:
            db.rollback()
        task_log.exception("billing.dunning_cycle.failed")
        raise
    finally:
        db.close()
