from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Tenant, User
from app.schemas import MessageResponse, TenantOut


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/tenants", response_model=list[TenantOut])
def list_all_tenants(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[TenantOut]:
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    return [TenantOut.model_validate(item) for item in tenants]


@router.post("/tenants/{tenant_id}/suspend", response_model=MessageResponse)
def suspend_tenant(tenant_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> MessageResponse:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    tenant.status = "suspended"
    tenant.updated_at = datetime.utcnow()
    db.add(tenant)
    db.commit()
    return MessageResponse(message="Tenant suspended")
