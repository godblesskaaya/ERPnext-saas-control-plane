from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import TenantRole

class MessageResponse(BaseModel):
    message: str = Field(description="Human-readable status message.", examples=["processed"])


class BillingPortalResponse(BaseModel):
    url: str = Field(description="Billing portal URL for self-service subscription management.")


class BillingInvoiceOut(BaseModel):
    id: str
    status: str | None = None
    amount_due: int | None = None
    amount_paid: int | None = None
    currency: str | None = None
    collection_method: str | None = None
    payment_method_types: list[str] | None = None
    metadata: dict[str, Any] | None = None
    hosted_invoice_url: str | None = None
    invoice_pdf: str | None = None
    created_at: datetime | None = None


class BillingInvoiceListResponse(BaseModel):
    invoices: list[BillingInvoiceOut]


class BillingPlanSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    slug: str | None = None
    display_name: str | None = Field(default=None, serialization_alias="displayName")


class BillingStatusSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    billing_state: str = Field(serialization_alias="billingState")
    entitlement_state: str = Field(serialization_alias="entitlementState")
    tenant_operational_state: str = Field(serialization_alias="tenantOperationalState")
    reason_code: str = Field(serialization_alias="reasonCode")
    reason_label: str = Field(serialization_alias="reasonLabel")
    grace_ends_at: datetime | None = Field(default=None, serialization_alias="graceEndsAt")
    next_action: str | None = Field(default=None, serialization_alias="nextAction")
    payment_confirmed: bool = Field(serialization_alias="paymentConfirmed")
    billing_blocked: bool = Field(serialization_alias="billingBlocked")
    provisioning_allowed: bool = Field(serialization_alias="provisioningAllowed")
    requires_manual_review: bool = Field(serialization_alias="requiresManualReview")
    source: str
    subscription_status: str = Field(serialization_alias="subscriptionStatus")
    legacy_billing_status: str = Field(serialization_alias="legacyBillingStatus")
    latest_invoice_id: str | None = Field(default=None, serialization_alias="latestInvoiceId")
    latest_payment_attempt_id: str | None = Field(default=None, serialization_alias="latestPaymentAttemptId")


class BillingBalanceSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    currency: str
    amount_due: int = Field(serialization_alias="amountDue")
    amount_overdue: int = Field(serialization_alias="amountOverdue")


class BillingNextEventOut(BaseModel):
    type: str
    at: datetime


class BillingInvoiceSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    erp_invoice_id: str | None = Field(default=None, serialization_alias="erpInvoiceId")
    invoice_number: str | None = Field(default=None, serialization_alias="invoiceNumber")
    tenant_id: str = Field(serialization_alias="tenantId")
    subscription_id: str | None = Field(default=None, serialization_alias="subscriptionId")
    status: str
    collection_stage: str | None = Field(default=None, serialization_alias="collectionStage")
    amount_due: int = Field(serialization_alias="amountDue")
    amount_paid: int = Field(serialization_alias="amountPaid")
    currency: str | None = None
    due_date: datetime | None = Field(default=None, serialization_alias="dueDate")
    issued_at: datetime | None = Field(default=None, serialization_alias="issuedAt")
    paid_at: datetime | None = Field(default=None, serialization_alias="paidAt")
    hosted_invoice_url: str | None = Field(default=None, serialization_alias="hostedInvoiceUrl")
    last_synced_at: datetime | None = Field(default=None, serialization_alias="lastSyncedAt")
    created_at: datetime | None = Field(default=None, serialization_alias="createdAt")
    updated_at: datetime | None = Field(default=None, serialization_alias="updatedAt")


class PaymentAttemptSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    invoice_id: str = Field(serialization_alias="invoiceId")
    provider: str
    provider_reference: str | None = Field(default=None, serialization_alias="providerReference")
    status: str
    amount: int
    currency: str | None = None
    checkout_url: str | None = Field(default=None, serialization_alias="checkoutUrl")
    failure_reason: str | None = Field(default=None, serialization_alias="failureReason")
    created_at: datetime | None = Field(default=None, serialization_alias="createdAt")
    updated_at: datetime | None = Field(default=None, serialization_alias="updatedAt")


class BillingTimelineEventOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    event_type: str = Field(serialization_alias="type")
    source: str
    timestamp: datetime
    summary: str | None = None
    invoice_id: str | None = Field(default=None, serialization_alias="invoiceId")
    payment_attempt_id: str | None = Field(default=None, serialization_alias="paymentAttemptId")
    severity: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class BillingAccountWorkspaceActionsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    can_create_payment_attempt: bool = Field(serialization_alias="canCreatePaymentAttempt")
    can_retry_payment: bool = Field(serialization_alias="canRetryPayment")
    can_open_invoice: bool = Field(serialization_alias="canOpenInvoice")
    can_reactivate: bool = Field(serialization_alias="canReactivate")


class BillingInvoiceActionsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    can_pay: bool = Field(serialization_alias="canPay")
    can_retry_payment: bool = Field(serialization_alias="canRetryPayment")
    can_open_hosted_invoice: bool = Field(serialization_alias="canOpenHostedInvoice")


class BillingAccountWorkspaceOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(serialization_alias="tenantId")
    subscription_id: str | None = Field(default=None, serialization_alias="subscriptionId")
    billing_account_id: str | None = Field(default=None, serialization_alias="billingAccountId")
    account_status: str = Field(serialization_alias="accountStatus")
    plan: BillingPlanSummaryOut
    status: BillingStatusSummaryOut
    balance: BillingBalanceSummaryOut
    next_billing_event: BillingNextEventOut | None = Field(default=None, serialization_alias="nextBillingEvent")
    open_invoices: list[BillingInvoiceSummaryOut] = Field(default_factory=list, serialization_alias="openInvoices")
    latest_payment_attempt: PaymentAttemptSummaryOut | None = Field(default=None, serialization_alias="latestPaymentAttempt")
    actions: BillingAccountWorkspaceActionsOut


class BillingInvoiceListByTenantResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(serialization_alias="tenantId")
    invoices: list[BillingInvoiceSummaryOut]


class BillingInvoiceDetailResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    invoice: BillingInvoiceSummaryOut
    status: BillingStatusSummaryOut
    available_actions: BillingInvoiceActionsOut = Field(serialization_alias="availableActions")


class PaymentAttemptListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(serialization_alias="tenantId")
    payment_attempts: list[PaymentAttemptSummaryOut] = Field(serialization_alias="paymentAttempts")


class PaymentAttemptCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider: str | None = None
    return_url: str | None = Field(default=None, alias="returnUrl", serialization_alias="returnUrl")
    cancel_url: str | None = Field(default=None, alias="cancelUrl", serialization_alias="cancelUrl")
    channel_hint: str | None = Field(default=None, alias="channelHint", serialization_alias="channelHint")


class PaymentAttemptCreateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    payment_attempt: PaymentAttemptSummaryOut = Field(serialization_alias="paymentAttempt")


class BillingTimelineResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(serialization_alias="tenantId")
    events: list[BillingTimelineEventOut]


class TenantReadinessOut(BaseModel):
    ready: bool
    message: str


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
                    "phone": "+255700000000",
                }
            ]
        }
    )

    email: EmailStr = Field(description="Unique account email.")
    password: str = Field(min_length=8, max_length=128, description="User password (8-128 chars).")
    phone: str | None = Field(default=None, max_length=32, description="Optional phone number for SMS notifications.")


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


class ProfileUpdateRequest(BaseModel):
    phone: str | None = Field(default=None, max_length=32, description="Optional phone number for SMS notifications.")


class NotificationPreferencesUpdateRequest(BaseModel):
    email_alerts: bool | None = Field(default=None, description="Enable or disable general email alerts.")
    sms_alerts: bool | None = Field(default=None, description="Enable or disable SMS alerts.")
    billing_alerts: bool | None = Field(default=None, description="Enable or disable billing alerts.")
    provisioning_alerts: bool | None = Field(default=None, description="Enable or disable provisioning alerts.")
    support_alerts: bool | None = Field(default=None, description="Enable or disable support alerts.")


class NotificationPreferencesOut(BaseModel):
    email_alerts: bool
    sms_alerts: bool
    billing_alerts: bool
    provisioning_alerts: bool
    support_alerts: bool


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "owner@example.com",
                }
            ]
        }
    )

    email: EmailStr = Field(description="Account email to receive reset instructions.")


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "token": "reset-token",
                    "new_password": "N3wS3cureP@ssw0rd!",
                }
            ]
        }
    )

    token: str = Field(min_length=20, max_length=512, description="One-time password-reset token.")
    new_password: str = Field(min_length=8, max_length=128, description="New password (8-128 chars).")


class VerifyEmailRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "token": "email-verification-token",
                }
            ]
        }
    )

    token: str = Field(min_length=20, max_length=512, description="One-time email-verification token.")


class ImpersonationLinkCreateRequest(BaseModel):
    target_email: EmailStr = Field(description="Email for the account to impersonate for support troubleshooting.")
    reason: str = Field(
        min_length=3,
        max_length=500,
        description="Operator reason for issuing the impersonation link (captured in audit logs).",
    )


class ImpersonationExchangeRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512, description="One-time support impersonation token.")


class ImpersonationLinkResponse(BaseModel):
    token: str = Field(description="Raw one-time token. Share securely with the intended operator only.")
    url: str = Field(description="Direct URL for exchanging the impersonation token.")
    expires_at: datetime = Field(description="Token expiration timestamp.")
    target_user_id: str
    target_email: EmailStr


class TokenResponse(BaseModel):
    access_token: str = Field(description="JWT access token.")
    token_type: str = Field(default="bearer", description="OAuth2 token type.")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    phone: str | None = None
    role: str
    email_verified: bool = Field(description="Whether the user has verified their email address.")
    email_verified_at: datetime | None = Field(default=None, description="Timestamp when email was verified.")
    created_at: datetime


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    actor_id: str | None
    actor_role: str
    actor_email: EmailStr | None = None
    action: str
    resource: str
    resource_id: str | None
    ip_address: str | None
    metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata_json")
    created_at: datetime


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    owner_id: str
    created_at: datetime
    updated_at: datetime


class TenantMemberOut(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    user_email: EmailStr | None = None
    role: TenantRole
    created_at: datetime


class TenantMemberInviteRequest(BaseModel):
    email: EmailStr
    role: TenantRole = Field(default=TenantRole.admin)


class TenantMemberUpdateRequest(BaseModel):
    role: TenantRole


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


class TenantUpdateRequest(BaseModel):
    plan: str | None = Field(
        default=None,
        min_length=2,
        max_length=30,
        description="Updated subscription plan. Supported values: starter, business, enterprise.",
    )
    chosen_app: str | None = Field(
        default=None,
        max_length=50,
        description="Business-plan app selection when plan is business.",
    )


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str | None
    owner_id: str
    subdomain: str
    domain: str
    site_name: str
    company_name: str
    plan: str = Field(description="Tenant plan. Expected values: starter, business, enterprise.")
    chosen_app: str | None
    status: str = Field(
        description=(
            "Tenant lifecycle status. Typical values: pending_payment, pending, provisioning, active, suspended, "
            "suspended_admin, suspended_billing, upgrading, restoring, pending_deletion, deleting, deleted, failed."
        )
    )
    subscription_status: str | None = Field(
        default=None,
        description="Canonical subscription state (pending, trialing, active, past_due, cancelled, paused).",
    )
    billing_status: str = Field(description="Compatibility billing state derived from subscription status.")
    payment_provider: str = Field(description="Active billing provider (for example: azampay, selcom, stripe, dpo).")
    payment_channel: str | None = Field(
        default=None,
        description="Preferred payment channel when known (mobile_money, card, bank_transfer, invoice).",
    )
    dpo_transaction_token: str | None = Field(
        default=None,
        description="Checkout/payment token for non-Stripe providers (for example AzamPay, DPO, or Selcom).",
    )
    stripe_checkout_session_id: str | None = None
    stripe_subscription_id: str | None = None
    platform_customer_id: str | None
    created_at: datetime
    updated_at: datetime


class PaginatedTenantResponse(BaseModel):
    data: list[TenantOut]
    total: int
    page: int
    limit: int


class SubdomainAvailabilityResponse(BaseModel):
    subdomain: str = Field(description="Normalized requested subdomain.")
    domain: str | None = Field(default=None, description="Full domain when the subdomain syntax is valid.")
    available: bool = Field(description="Whether the subdomain can be used for a new tenant.")
    reason: str | None = Field(
        default=None,
        description="Availability reason. Typical values: reserved, invalid, taken.",
        examples=["taken"],
    )
    message: str = Field(description="Human-readable availability explanation.")


class DomainMappingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    domain: str
    status: str
    verification_token: str
    created_at: datetime
    verified_at: datetime | None
    updated_at: datetime


class DomainMappingCreateRequest(BaseModel):
    domain: str = Field(min_length=3, max_length=255, description="Custom domain to map to the tenant.")


class DomainMappingVerifyRequest(BaseModel):
    token: str | None = Field(default=None, description="Optional verification token for domain verification.")


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


class PaginatedAuditLogResponse(BaseModel):
    data: list[AuditLogOut]
    total: int
    page: int
    limit: int


class MetricsSummary(BaseModel):
    total_tenants: int
    active_tenants: int
    suspended_tenants: int
    failed_tenants: int
    provisioning_tenants: int
    pending_payment_tenants: int
    trialing_tenants: int
    trial_converted_tenants: int
    trial_expired_past_due_tenants: int
    trial_cancelled_tenants: int
    jobs_last_24h: int
    provisioning_success_rate_7d: float
    dead_letter_count: int
    support_open_notes: int
    support_breached_notes: int
    support_due_soon_notes: int


class TenantRuntimeConsistencyEntryOut(BaseModel):
    tenant_id: str
    subdomain: str
    domain: str
    status: str
    subscription_status: str | None = None
    plan: str | None = None
    owner_email: EmailStr | None = None
    runtime_expected: bool
    runtime_exists: bool
    classification: str
    last_job_type: str | None = None
    last_job_status: str | None = None
    last_job_at: datetime | None = None


class TenantRuntimeConsistencyReportOut(BaseModel):
    generated_at: datetime
    total_tenants: int
    runtime_expected_missing: int
    pending_without_runtime: int
    pending_payment_without_runtime: int
    deleted_with_runtime: int
    runtime_sites_without_db_entry: int
    entries: list[TenantRuntimeConsistencyEntryOut]
    runtime_only_sites: list[str]


class TenantSummaryOut(BaseModel):
    tenant_id: str
    last_job: JobOut | None = None
    last_backup: BackupManifestOut | None = None
    last_audit: AuditLogOut | None = None
    last_invoice: BillingInvoiceOut | None = None


class TenantRestoreRequest(BaseModel):
    backup_id: str = Field(description="Backup manifest id to restore.")


class DunningItemOut(BaseModel):
    tenant_id: str
    tenant_name: str
    domain: str
    status: str
    subscription_status: str | None = None
    billing_status: str | None = None
    payment_channel: str | None = None
    next_retry_at: datetime | None = None
    grace_ends_at: datetime | None = None
    last_invoice_id: str | None = None
    last_payment_attempt: datetime | None = None


class BillingReconciliationExceptionOut(BaseModel):
    tenant_id: str
    subscription_id: str | None = None
    invoice_id: str | None = None
    payment_attempt_id: str | None = None
    exception_type: str
    severity: str
    status: str
    summary: str
    detected_at: datetime


class SupportNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    author_id: str | None
    author_role: str
    author_email: EmailStr | None = None
    category: str
    owner_name: str | None = None
    owner_contact: str | None = None
    sla_due_at: datetime | None = None
    status: str
    resolved_at: datetime | None = None
    sla_state: str | None = None
    sla_last_evaluated_at: datetime | None = None
    note: str
    created_at: datetime
    updated_at: datetime


class SupportNoteCreateRequest(BaseModel):
    tenant_id: str
    category: str = Field(default="note", max_length=30)
    owner_name: str | None = Field(default=None, max_length=120)
    owner_contact: str | None = Field(default=None, max_length=120)
    sla_due_at: datetime | None = None
    status: str | None = Field(default=None, max_length=20)
    note: str = Field(min_length=1, max_length=4000)


class SupportNoteUpdateRequest(BaseModel):
    category: str | None = Field(default=None, max_length=30)
    owner_name: str | None = Field(default=None, max_length=120)
    owner_contact: str | None = Field(default=None, max_length=120)
    sla_due_at: datetime | None = None
    status: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=4000)


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
