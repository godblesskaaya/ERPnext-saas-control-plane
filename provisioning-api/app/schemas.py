from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class MessageResponse(BaseModel):
    message: str


class DeadLetterJobOut(BaseModel):
    id: str
    func_name: str
    args: list
    kwargs: dict
    enqueued_at: datetime | None = None


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    role: str
    created_at: datetime


class TenantCreateRequest(BaseModel):
    subdomain: str = Field(min_length=3, max_length=63)
    company_name: str = Field(min_length=2, max_length=255)
    plan: str = Field(min_length=2, max_length=30)


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    subdomain: str
    domain: str
    site_name: str
    company_name: str
    plan: str
    status: str
    billing_status: str
    stripe_checkout_session_id: str | None
    stripe_subscription_id: str | None
    platform_customer_id: str | None
    created_at: datetime
    updated_at: datetime


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    type: str
    status: str
    rq_job_id: str | None
    logs: str
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class BackupManifestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    job_id: str
    file_path: str
    file_size_bytes: int
    created_at: datetime
    expires_at: datetime
    s3_key: str | None


class TenantCreateResponse(BaseModel):
    tenant: TenantOut
    job: JobOut | None = None
    checkout_url: str | None = None
    checkout_session_id: str | None = None


class ResetAdminPasswordRequest(BaseModel):
    new_password: str | None = Field(default=None, min_length=8, max_length=128)


class ResetAdminPasswordResponse(BaseModel):
    tenant_id: str
    domain: str
    administrator_user: str = "Administrator"
    admin_password: str
    message: str


class BillingPayload(BaseModel):
    tenant_id: str
    domain: str
    company_name: str
    plan: str
    owner_email: EmailStr
