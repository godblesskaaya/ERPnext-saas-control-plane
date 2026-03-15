from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.models import BackupManifest, Job, Tenant, User
from app.domains.tenants import backup_service
from app.domains.tenants.backup_service import cleanup_expired_backups, parse_backup_artifact, persist_backup_manifest


@pytest.fixture(autouse=True)
def restore_backup_settings():
    attrs = [
        "bench_exec_mode",
        "bench_workdir",
        "backup_s3_bucket",
        "backup_s3_region",
        "backup_s3_prefix",
        "backup_s3_strict",
    ]
    original = {name: getattr(backup_service.settings, name) for name in attrs}
    yield
    for name, value in original.items():
        setattr(backup_service.settings, name, value)


def _create_tenant_and_job(db_session, *, plan: str = "starter") -> tuple[Tenant, Job]:
    user = User(email=f"{plan}@example.com", password_hash="hash", role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain=f"{plan}-tenant",
        domain=f"{plan}-tenant.erp.blenkotechnologies.co.tz",
        site_name=f"{plan}-tenant.erp.blenkotechnologies.co.tz",
        company_name="Plan Co",
        plan=plan,
        status="active",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="backup", status="running")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return tenant, job


def test_parse_backup_artifact_prefers_database_backup_with_size():
    output = "\n".join(
        [
            "Created backup at /tmp/backups/files.tar (10 KB)",
            "Created database backup at /tmp/backups/database.sql.gz (2048 bytes)",
        ]
    )

    artifact = parse_backup_artifact(output)

    assert artifact is not None
    assert artifact.file_path == "/tmp/backups/database.sql.gz"
    assert artifact.file_size_bytes == 2048


def test_persist_backup_manifest_uses_mock_fallback_and_retention(db_session):
    tenant, job = _create_tenant_and_job(db_session, plan="starter")
    backup_service.settings.bench_exec_mode = "mock"
    backup_service.settings.backup_s3_bucket = ""

    manifest = persist_backup_manifest(db_session, tenant=tenant, job=job, bench_stdout="MOCK_OK")

    assert manifest.tenant_id == tenant.id
    assert manifest.job_id == job.id
    assert manifest.file_path == f"/tmp/mock-backups/{tenant.subdomain}-{job.id}.sql.gz"
    assert manifest.file_size_bytes == len("MOCK_OK")
    assert (manifest.expires_at - manifest.created_at).days == 7


def test_persist_backup_manifest_uploads_to_s3_when_bucket_configured(db_session, tmp_path, monkeypatch):
    tenant, job = _create_tenant_and_job(db_session, plan="business")

    backup_file = tmp_path / "db.sql.gz"
    backup_file.write_bytes(b"backup-payload")

    upload_calls: list[tuple[str, str, str]] = []

    class DummyS3Client:
        def upload_file(self, file_path: str, bucket: str, key: str) -> None:
            upload_calls.append((file_path, bucket, key))

    class DummyBoto3:
        @staticmethod
        def client(*args, **kwargs):
            return DummyS3Client()

    backup_service.settings.backup_s3_bucket = "erp-backups"
    backup_service.settings.backup_s3_prefix = "tenant-backups"
    backup_service.settings.backup_s3_region = "eu-central-1"
    backup_service.settings.backup_s3_strict = False

    monkeypatch.setattr(backup_service.importlib, "import_module", lambda _: DummyBoto3)

    output = f"Database backup complete: {backup_file} ({backup_file.stat().st_size} bytes)"
    manifest = persist_backup_manifest(db_session, tenant=tenant, job=job, bench_stdout=output)

    assert manifest.s3_key is not None
    assert manifest.s3_key.endswith("/db.sql.gz")
    assert manifest.s3_key.startswith(f"tenant-backups/{tenant.id}/")
    assert len(upload_calls) == 1
    assert upload_calls[0][0] == str(backup_file)
    assert upload_calls[0][1] == "erp-backups"
    assert upload_calls[0][2] == manifest.s3_key
    assert (manifest.expires_at - manifest.created_at).days == 30


def test_persist_backup_manifest_s3_failure_non_strict_does_not_crash(db_session, monkeypatch):
    tenant, job = _create_tenant_and_job(db_session, plan="enterprise")
    backup_service.settings.backup_s3_bucket = "erp-backups"
    backup_service.settings.backup_s3_strict = False

    monkeypatch.setattr(backup_service, "_upload_to_s3", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("s3 down")))

    manifest = persist_backup_manifest(
        db_session,
        tenant=tenant,
        job=job,
        bench_stdout="Database backup complete: /tmp/backups/db.sql.gz (1 bytes)",
    )

    assert manifest.s3_key is None
    assert (manifest.expires_at - manifest.created_at).days == 90


def test_persist_backup_manifest_s3_failure_strict_raises(db_session, monkeypatch):
    tenant, job = _create_tenant_and_job(db_session)
    backup_service.settings.backup_s3_bucket = "erp-backups"
    backup_service.settings.backup_s3_strict = True

    def _raise(*args, **kwargs):
        raise RuntimeError("upload failed")

    monkeypatch.setattr(backup_service, "_upload_to_s3", _raise)

    with pytest.raises(RuntimeError, match="upload failed"):
        persist_backup_manifest(
            db_session,
            tenant=tenant,
            job=job,
            bench_stdout="Database backup complete: /tmp/backups/db.sql.gz (1 bytes)",
        )


def test_cleanup_expired_backups_deletes_files_rows_and_skips_missing(db_session, tmp_path):
    tenant, job = _create_tenant_and_job(db_session)

    existing_file = tmp_path / "expired.sql.gz"
    existing_file.write_text("payload")

    expired_manifest = BackupManifest(
        tenant_id=tenant.id,
        job_id=job.id,
        file_path=str(existing_file),
        file_size_bytes=existing_file.stat().st_size,
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    missing_manifest = BackupManifest(
        tenant_id=tenant.id,
        job_id=job.id,
        file_path=str(Path(tmp_path) / "missing.sql.gz"),
        file_size_bytes=1,
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    valid_manifest = BackupManifest(
        tenant_id=tenant.id,
        job_id=job.id,
        file_path=str(Path(tmp_path) / "future.sql.gz"),
        file_size_bytes=1,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(days=5),
    )
    db_session.add_all([expired_manifest, missing_manifest, valid_manifest])
    db_session.commit()

    result = cleanup_expired_backups(db_session, now=datetime.now(timezone.utc))

    assert result.scanned == 2
    assert result.deleted_files == 1
    assert result.skipped_missing_files == 1
    assert result.deleted_rows == 2
    assert result.errors == []
    assert not existing_file.exists()

    remaining_ids = {row.id for row in db_session.query(BackupManifest).all()}
    assert valid_manifest.id in remaining_ids
    assert expired_manifest.id not in remaining_ids
    assert missing_manifest.id not in remaining_ids
