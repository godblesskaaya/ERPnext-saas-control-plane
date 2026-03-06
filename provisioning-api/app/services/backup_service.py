from __future__ import annotations

import importlib
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.logging_config import get_logger
from app.models import BackupManifest, Job, Tenant


settings = get_settings()
log = get_logger(__name__)

RETENTION_DAYS_BY_PLAN: dict[str, int] = {
    "starter": 7,
    "business": 30,
    "enterprise": 90,
}

_BACKUP_PATH_REGEX = re.compile(
    r"(?P<path>(?:/|\.{1,2}/)?[A-Za-z0-9_./-]+\.(?:sql(?:\.gz)?|tgz|tar|json|gz))",
    re.IGNORECASE,
)
_SIZE_REGEX = re.compile(r"(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>[KMGT]?i?B)\b", re.IGNORECASE)
_BYTES_REGEX = re.compile(r"(?P<value>\d+)\s*bytes?\b", re.IGNORECASE)


@dataclass
class ParsedBackupArtifact:
    file_path: str
    file_size_bytes: int


@dataclass
class BackupCleanupResult:
    scanned: int = 0
    deleted_files: int = 0
    deleted_rows: int = 0
    skipped_missing_files: int = 0
    errors: list[str] = field(default_factory=list)


def retention_days_for_plan(plan: str) -> int:
    return RETENTION_DAYS_BY_PLAN.get(plan, RETENTION_DAYS_BY_PLAN["starter"])


def _parse_size_bytes(line: str) -> int | None:
    bytes_match = _BYTES_REGEX.search(line)
    if bytes_match:
        return int(bytes_match.group("value"))

    match = _SIZE_REGEX.search(line)
    if not match:
        return None

    value = float(match.group("value"))
    unit = match.group("unit").upper()
    multipliers = {
        "B": 1,
        "KB": 1024,
        "MB": 1024**2,
        "GB": 1024**3,
        "TB": 1024**4,
        "KIB": 1024,
        "MIB": 1024**2,
        "GIB": 1024**3,
        "TIB": 1024**4,
    }
    return int(value * multipliers.get(unit, 1))


def _normalize_path(path: str) -> str:
    backup_path = Path(path)
    if backup_path.is_absolute():
        return str(backup_path)
    return str((Path(settings.bench_workdir) / backup_path).resolve())


def _candidate_score(path: str, line: str, size: int | None) -> int:
    lowered = line.lower()
    score = 0
    if path.endswith(".sql.gz") or "database" in lowered:
        score += 100
    if "backup" in lowered:
        score += 20
    if path.startswith("/"):
        score += 5
    if size is not None:
        score += 3
    return score


def parse_backup_artifact(stdout: str) -> ParsedBackupArtifact | None:
    candidates: list[tuple[int, str, int | None]] = []
    for line in stdout.splitlines():
        size = _parse_size_bytes(line)
        for match in _BACKUP_PATH_REGEX.finditer(line):
            path = match.group("path")
            candidates.append((_candidate_score(path, line, size), path, size))

    if not candidates:
        return None

    _, selected_path, selected_size = max(candidates, key=lambda item: item[0])
    normalized_path = _normalize_path(selected_path)
    if selected_size is None and os.path.exists(normalized_path):
        selected_size = os.path.getsize(normalized_path)

    return ParsedBackupArtifact(file_path=normalized_path, file_size_bytes=selected_size or 0)


def _mock_backup_artifact(tenant: Tenant, job: Job, stdout: str) -> ParsedBackupArtifact:
    return ParsedBackupArtifact(
        file_path=f"/tmp/mock-backups/{tenant.subdomain}-{job.id}.sql.gz",
        file_size_bytes=len(stdout.encode("utf-8")),
    )


def _s3_client() -> Any:
    boto3 = importlib.import_module("boto3")
    client_kwargs: dict[str, Any] = {}
    if settings.backup_s3_region:
        client_kwargs["region_name"] = settings.backup_s3_region
    return boto3.client("s3", **client_kwargs)


def _build_s3_key(tenant: Tenant, file_path: str, created_at: datetime) -> str:
    filename = Path(file_path).name or "backup.dat"
    prefix = settings.backup_s3_prefix.strip("/")
    key_parts = [segment for segment in [prefix, tenant.id, created_at.strftime("%Y/%m/%d"), filename] if segment]
    return "/".join(key_parts)


def _upload_to_s3(tenant: Tenant, file_path: str, created_at: datetime) -> str:
    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    key = _build_s3_key(tenant, file_path, created_at)
    _s3_client().upload_file(file_path, settings.backup_s3_bucket, key)
    return key


def persist_backup_manifest(db: Session, *, tenant: Tenant, job: Job, bench_stdout: str) -> BackupManifest:
    created_at = datetime.utcnow()
    artifact = parse_backup_artifact(bench_stdout)
    if artifact is None:
        if settings.bench_exec_mode == "mock":
            artifact = _mock_backup_artifact(tenant, job, bench_stdout)
        else:
            raise ValueError("Backup completed but artifact path could not be parsed from bench output")

    expires_at = created_at + timedelta(days=retention_days_for_plan(tenant.plan))
    s3_key: str | None = None

    if settings.backup_s3_bucket:
        try:
            s3_key = _upload_to_s3(tenant, artifact.file_path, created_at)
        except Exception as exc:
            if settings.backup_s3_strict:
                raise
            log.warning(
                "tenant.backup.s3_upload_failed",
                tenant_id=tenant.id,
                job_id=job.id,
                file_path=artifact.file_path,
                error=str(exc),
            )

    manifest = BackupManifest(
        tenant_id=tenant.id,
        job_id=job.id,
        file_path=artifact.file_path,
        file_size_bytes=artifact.file_size_bytes,
        created_at=created_at,
        expires_at=expires_at,
        s3_key=s3_key,
    )
    db.add(manifest)
    db.commit()
    db.refresh(manifest)
    return manifest


def list_backup_manifests(db: Session, tenant_id: str) -> list[BackupManifest]:
    return (
        db.query(BackupManifest)
        .filter(BackupManifest.tenant_id == tenant_id)
        .order_by(BackupManifest.created_at.desc())
        .all()
    )


def cleanup_expired_backups(db: Session, *, now: datetime | None = None) -> BackupCleanupResult:
    cutoff = now or datetime.utcnow()
    result = BackupCleanupResult()
    expired = (
        db.query(BackupManifest)
        .filter(BackupManifest.expires_at <= cutoff)
        .order_by(BackupManifest.expires_at.asc())
        .all()
    )

    for manifest in expired:
        result.scanned += 1
        removable = True

        if manifest.file_path:
            try:
                os.remove(manifest.file_path)
                result.deleted_files += 1
            except FileNotFoundError:
                result.skipped_missing_files += 1
            except OSError as exc:
                removable = False
                result.errors.append(f"{manifest.id}: {exc}")
                log.warning(
                    "tenant.backup.cleanup_file_delete_failed",
                    backup_id=manifest.id,
                    file_path=manifest.file_path,
                    error=str(exc),
                )

        if not removable:
            continue

        db.delete(manifest)
        result.deleted_rows += 1

    if result.deleted_rows:
        db.commit()

    return result
