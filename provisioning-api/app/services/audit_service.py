from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def _request_ip(request: Request | None) -> str | None:
    if request is None or request.client is None:
        return None
    return request.client.host


def record_audit_event(
    db: Session,
    *,
    action: str,
    resource: str,
    actor: User | None = None,
    actor_role: str | None = None,
    resource_id: str | None = None,
    request: Request | None = None,
    ip_address: str | None = None,
    metadata: dict[str, Any] | None = None,
    commit: bool = True,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_role=actor.role if actor else (actor_role or "system"),
        action=action,
        resource=resource,
        resource_id=resource_id,
        ip_address=ip_address or _request_ip(request),
        metadata_json=dict(metadata or {}),
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry
