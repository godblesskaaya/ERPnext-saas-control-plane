from __future__ import annotations

from app.utils.time import utcnow

from app.db import SessionLocal
from app.logging_config import get_logger
from app.domains.tenants.backup_service import cleanup_expired_backups


log = get_logger(__name__)


def cleanup_expired_backups_job() -> dict[str, int | list[str] | str]:
    db = SessionLocal()
    started_at = utcnow()
    try:
        result = cleanup_expired_backups(db)
        payload = {
            "started_at": started_at.isoformat(),
            "scanned": result.scanned,
            "deleted_files": result.deleted_files,
            "deleted_rows": result.deleted_rows,
            "skipped_missing_files": result.skipped_missing_files,
            "errors": result.errors,
        }
        log.info("tenant.backup.cleanup.completed", **payload)
        return payload
    finally:
        db.close()
