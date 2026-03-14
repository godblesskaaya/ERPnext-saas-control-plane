from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.logging_config import get_logger


log = get_logger(__name__)


@dataclass
class TenantTLSSyncResult:
    attempted: bool
    succeeded: bool
    message: str


def sync_tenant_tls_routes(*, prime_certs: bool) -> TenantTLSSyncResult:
    settings = get_settings()
    if not settings.tenant_tls_sync_enabled:
        return TenantTLSSyncResult(attempted=False, succeeded=True, message="disabled")

    script_path = Path(settings.tenant_tls_sync_script_path)
    if not script_path.is_file():
        return TenantTLSSyncResult(
            attempted=False,
            succeeded=False,
            message=f"script_not_found:{script_path}",
        )

    command = [str(script_path)]
    if prime_certs:
        command.append("--prime-certs")

    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=settings.tenant_tls_sync_timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        log.warning("tenant.tls_sync.timeout", command=command)
        return TenantTLSSyncResult(attempted=True, succeeded=False, message="timeout")
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("tenant.tls_sync.error", command=command, error=str(exc))
        return TenantTLSSyncResult(attempted=True, succeeded=False, message=str(exc))

    output = (proc.stdout or "").strip() or (proc.stderr or "").strip() or f"exit={proc.returncode}"
    if proc.returncode != 0:
        log.warning(
            "tenant.tls_sync.failed",
            command=command,
            returncode=proc.returncode,
            stdout=proc.stdout,
            stderr=proc.stderr,
        )
        return TenantTLSSyncResult(attempted=True, succeeded=False, message=output)
    return TenantTLSSyncResult(attempted=True, succeeded=True, message=output)
