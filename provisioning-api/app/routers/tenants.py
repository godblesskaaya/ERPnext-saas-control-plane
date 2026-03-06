from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.bench.commands import build_set_admin_password_command
from app.bench.runner import BenchCommandError, run_bench_command
from app.db import get_db
from app.deps import get_current_user
from app.models import Tenant, User
from app.schemas import (
    JobOut,
    ResetAdminPasswordRequest,
    ResetAdminPasswordResponse,
    TenantCreateRequest,
    TenantCreateResponse,
    TenantOut,
)
from app.services.tenant_service import create_tenant_and_enqueue, enqueue_backup, enqueue_delete


router = APIRouter(prefix="/tenants", tags=["tenants"])


def _get_accessible_tenant(tenant_id: str, db: Session, current_user: User) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if current_user.role != "admin" and tenant.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return tenant


@router.post("", response_model=TenantCreateResponse, status_code=status.HTTP_202_ACCEPTED)
def create_tenant(
    payload: TenantCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantCreateResponse:
    tenant, job = create_tenant_and_enqueue(db, current_user, payload.subdomain, payload.company_name, payload.plan)
    return TenantCreateResponse(tenant=TenantOut.model_validate(tenant), job=JobOut.model_validate(job))


@router.get("", response_model=list[TenantOut])
def list_tenants(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[TenantOut]:
    query = db.query(Tenant)
    if current_user.role != "admin":
        query = query.filter(Tenant.owner_id == current_user.id)
    tenants = query.order_by(Tenant.created_at.desc()).all()
    return [TenantOut.model_validate(item) for item in tenants]


@router.get("/{tenant_id}", response_model=TenantOut)
def get_tenant(tenant_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> TenantOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    return TenantOut.model_validate(tenant)


@router.post("/{tenant_id}/backup", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def backup_tenant(tenant_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> JobOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    job = enqueue_backup(db, tenant)
    return JobOut.model_validate(job)


@router.delete("/{tenant_id}", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def delete_tenant(tenant_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> JobOut:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    job = enqueue_delete(db, tenant)
    return JobOut.model_validate(job)


@router.post(
    "/{tenant_id}/reset-admin-password",
    response_model=ResetAdminPasswordResponse,
    status_code=status.HTTP_200_OK,
)
def reset_admin_password(
    tenant_id: str,
    payload: ResetAdminPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResetAdminPasswordResponse:
    tenant = _get_accessible_tenant(tenant_id, db, current_user)
    new_password = payload.new_password.strip() if payload.new_password else secrets.token_urlsafe(14)

    try:
        run_bench_command(build_set_admin_password_command(tenant.domain, new_password))
    except BenchCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset administrator password: {exc.result.stderr or exc.result.stdout}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return ResetAdminPasswordResponse(
        tenant_id=tenant.id,
        domain=tenant.domain,
        admin_password=new_password,
        message="Administrator password has been reset.",
    )
