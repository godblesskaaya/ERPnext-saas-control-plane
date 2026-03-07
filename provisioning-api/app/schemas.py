from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class MessageResponse(BaseModel):
    message: str = Field(description="Human-readable status message.", examples=["processed"])


class DeadLetterJobOut(BaseModel):
    id: str
    func_name: str
    args: list
    kwargs: dict
    enqueued_at: datetime | None = None


class SignupRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "owner@example.com",
                    "password": "S3cureP@ssw0rd!",
                }
            ]
        }
    )

    email: EmailStr = Field(description="Unique account email.")
    password: str = Field(min_length=8, max_length=128, description="User password (8-128 chars).")


class LoginRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "owner@example.com",
                    "password": "S3cureP@ssw0rd!",
                }
            ]
        }
    )

    email: EmailStr = Field(description="Registered account email.")
    password: str = Field(min_length=8, max_length=128, description="Account password.")


class TokenResponse(BaseModel):
    access_token: str = Field(description="JWT access token.")
    token_type: str = Field(default="bearer", description="OAuth2 token type.")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    role: str
    created_at: datetime


class TenantCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "subdomain": "acme",
                    "company_name": "ACME Corp",
                    "plan": "starter",
                    "chosen_app": None,
                },
                {
                    "subdomain": "acme-sales",
                    "company_name": "ACME Sales",
                    "plan": "business",
                    "chosen_app": "crm",
                },
            ]
        }
    )

    subdomain: str = Field(min_length=3, max_length=63, description="Requested tenant subdomain (without root domain).")
    company_name: str = Field(min_length=2, max_length=255, description="Company legal/display name for the tenant.")
    plan: str = Field(
        min_length=2,
        max_length=30,
        description="Subscription plan. Supported values: starter, business, enterprise.",
        examples=["starter"],
    )
    chosen_app: str | None = Field(
        default=None,
        max_length=50,
        description="Business-plan app selection. Required for business, must be omitted for starter, optional/ignored for enterprise.",
        examples=["crm"],
    )


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    subdomain: str
    domain: str
    site_name: str
    company_name: str
    plan: str = Field(description="Tenant plan. Expected values: starter, business, enterprise.")
    chosen_app: str | None
    status: str = Field(
        description="Tenant lifecycle status. Typical values: pending_payment, pending, provisioning, active, suspended, deleting, deleted, failed."
    )
    billing_status: str = Field(description="Billing state. Typical values: pending, paid, failed, cancelled, unpaid.")
    payment_provider: str = Field(description="Active billing provider (for example: stripe, dpo).")
    dpo_transaction_token: str | None
    stripe_checkout_session_id: str | None
    stripe_subscription_id: str | None
    platform_customer_id: str | None
    created_at: datetime
    updated_at: datetime


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    type: str = Field(description="Job type. Typical values: create, backup, delete.")
    status: str = Field(description="Job execution state. Typical values: queued, running, succeeded, failed.")
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
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"new_password": "N3wS3cureP@ssw0rd"},
                {"new_password": None},
            ]
        }
    )

    new_password: str | None = Field(
        default=None,
        min_length=8,
        max_length=128,
        description="Optional explicit password. If omitted/null, a secure password is generated.",
    )


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
