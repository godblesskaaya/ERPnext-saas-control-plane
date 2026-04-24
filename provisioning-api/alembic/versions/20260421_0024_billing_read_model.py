from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260421_0024"
down_revision = "20260329_0023"
branch_labels = None
depends_on = None



def upgrade() -> None:
    op.create_table(
        "billing_accounts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=True),
        sa.Column("erp_customer_id", sa.String(length=120), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="TZS"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="needs_review"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_billing_accounts_tenant_id"),
    )
    op.create_index(op.f("ix_billing_accounts_customer_id"), "billing_accounts", ["customer_id"], unique=False)
    op.create_index(op.f("ix_billing_accounts_created_at"), "billing_accounts", ["created_at"], unique=False)
    op.create_index(op.f("ix_billing_accounts_erp_customer_id"), "billing_accounts", ["erp_customer_id"], unique=False)
    op.create_index(op.f("ix_billing_accounts_status"), "billing_accounts", ["status"], unique=False)
    op.create_index(op.f("ix_billing_accounts_tenant_id"), "billing_accounts", ["tenant_id"], unique=False)

    op.create_table(
        "billing_invoices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("subscription_id", sa.String(length=36), nullable=True),
        sa.Column("billing_account_id", sa.String(length=36), nullable=False),
        sa.Column("erp_invoice_id", sa.String(length=120), nullable=True),
        sa.Column("invoice_number", sa.String(length=120), nullable=True),
        sa.Column("amount_due", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("amount_paid", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="TZS"),
        sa.Column("invoice_status", sa.String(length=30), nullable=False, server_default="payment_pending"),
        sa.Column("collection_stage", sa.String(length=40), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["billing_account_id"], ["billing_accounts.id"]),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("erp_invoice_id", name="uq_billing_invoices_erp_invoice_id"),
        sa.UniqueConstraint("invoice_number", name="uq_billing_invoices_invoice_number"),
    )
    op.create_index(op.f("ix_billing_invoices_billing_account_id"), "billing_invoices", ["billing_account_id"], unique=False)
    op.create_index(op.f("ix_billing_invoices_collection_stage"), "billing_invoices", ["collection_stage"], unique=False)
    op.create_index(op.f("ix_billing_invoices_created_at"), "billing_invoices", ["created_at"], unique=False)
    op.create_index(op.f("ix_billing_invoices_due_date"), "billing_invoices", ["due_date"], unique=False)
    op.create_index(op.f("ix_billing_invoices_erp_invoice_id"), "billing_invoices", ["erp_invoice_id"], unique=False)
    op.create_index(op.f("ix_billing_invoices_invoice_number"), "billing_invoices", ["invoice_number"], unique=False)
    op.create_index(op.f("ix_billing_invoices_invoice_status"), "billing_invoices", ["invoice_status"], unique=False)
    op.create_index(op.f("ix_billing_invoices_issued_at"), "billing_invoices", ["issued_at"], unique=False)
    op.create_index(op.f("ix_billing_invoices_last_synced_at"), "billing_invoices", ["last_synced_at"], unique=False)
    op.create_index(op.f("ix_billing_invoices_paid_at"), "billing_invoices", ["paid_at"], unique=False)
    op.create_index(op.f("ix_billing_invoices_subscription_id"), "billing_invoices", ["subscription_id"], unique=False)
    op.create_index(op.f("ix_billing_invoices_tenant_id"), "billing_invoices", ["tenant_id"], unique=False)

    op.create_table(
        "payment_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("subscription_id", sa.String(length=36), nullable=True),
        sa.Column("billing_invoice_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_reference", sa.String(length=120), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="TZS"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="created"),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("checkout_url", sa.String(length=1024), nullable=True),
        sa.Column("provider_payload_snapshot", sa.JSON(), nullable=False),
        sa.Column("provider_response_snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["billing_invoice_id"], ["billing_invoices.id"]),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_attempts_billing_invoice_id"), "payment_attempts", ["billing_invoice_id"], unique=False)
    op.create_index(op.f("ix_payment_attempts_created_at"), "payment_attempts", ["created_at"], unique=False)
    op.create_index(op.f("ix_payment_attempts_provider"), "payment_attempts", ["provider"], unique=False)
    op.create_index(op.f("ix_payment_attempts_provider_reference"), "payment_attempts", ["provider_reference"], unique=False)
    op.create_index(op.f("ix_payment_attempts_status"), "payment_attempts", ["status"], unique=False)
    op.create_index(op.f("ix_payment_attempts_subscription_id"), "payment_attempts", ["subscription_id"], unique=False)
    op.create_index(op.f("ix_payment_attempts_tenant_id"), "payment_attempts", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_payment_attempts_updated_at"), "payment_attempts", ["updated_at"], unique=False)

    op.create_table(
        "billing_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=True),
        sa.Column("subscription_id", sa.String(length=36), nullable=True),
        sa.Column("billing_account_id", sa.String(length=36), nullable=True),
        sa.Column("billing_invoice_id", sa.String(length=36), nullable=True),
        sa.Column("payment_attempt_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("event_source", sa.String(length=40), nullable=False, server_default="system"),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="info"),
        sa.Column("summary", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["billing_account_id"], ["billing_accounts.id"]),
        sa.ForeignKeyConstraint(["billing_invoice_id"], ["billing_invoices.id"]),
        sa.ForeignKeyConstraint(["payment_attempt_id"], ["payment_attempts.id"]),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_events_billing_account_id"), "billing_events", ["billing_account_id"], unique=False)
    op.create_index(op.f("ix_billing_events_billing_invoice_id"), "billing_events", ["billing_invoice_id"], unique=False)
    op.create_index(op.f("ix_billing_events_created_at"), "billing_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_billing_events_event_source"), "billing_events", ["event_source"], unique=False)
    op.create_index(op.f("ix_billing_events_event_type"), "billing_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_billing_events_payment_attempt_id"), "billing_events", ["payment_attempt_id"], unique=False)
    op.create_index(op.f("ix_billing_events_severity"), "billing_events", ["severity"], unique=False)
    op.create_index(op.f("ix_billing_events_subscription_id"), "billing_events", ["subscription_id"], unique=False)
    op.create_index(op.f("ix_billing_events_tenant_id"), "billing_events", ["tenant_id"], unique=False)

    op.create_table(
        "billing_exceptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=True),
        sa.Column("subscription_id", sa.String(length=36), nullable=True),
        sa.Column("billing_account_id", sa.String(length=36), nullable=True),
        sa.Column("billing_invoice_id", sa.String(length=36), nullable=True),
        sa.Column("payment_attempt_id", sa.String(length=36), nullable=True),
        sa.Column("exception_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["billing_account_id"], ["billing_accounts.id"]),
        sa.ForeignKeyConstraint(["billing_invoice_id"], ["billing_invoices.id"]),
        sa.ForeignKeyConstraint(["payment_attempt_id"], ["payment_attempts.id"]),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_exceptions_billing_account_id"), "billing_exceptions", ["billing_account_id"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_billing_invoice_id"), "billing_exceptions", ["billing_invoice_id"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_created_at"), "billing_exceptions", ["created_at"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_exception_type"), "billing_exceptions", ["exception_type"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_payment_attempt_id"), "billing_exceptions", ["payment_attempt_id"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_resolved_at"), "billing_exceptions", ["resolved_at"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_status"), "billing_exceptions", ["status"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_subscription_id"), "billing_exceptions", ["subscription_id"], unique=False)
    op.create_index(op.f("ix_billing_exceptions_tenant_id"), "billing_exceptions", ["tenant_id"], unique=False)

    bind = op.get_bind()
    tenant_rows = bind.execute(
        sa.text(
            """
            SELECT id, owner_id, platform_customer_id, created_at, updated_at
            FROM tenants
            WHERE status NOT IN ('deleted')
            """
        )
    ).mappings()
    for row in tenant_rows:
        bind.execute(
            sa.text(
                """
                INSERT INTO billing_accounts (
                    id, tenant_id, customer_id, erp_customer_id, currency, status, created_at, updated_at
                ) VALUES (
                    :id, :tenant_id, :customer_id, :erp_customer_id, :currency, :status, :created_at, :updated_at
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "tenant_id": row["id"],
                "customer_id": row["owner_id"],
                "erp_customer_id": row["platform_customer_id"],
                "currency": "TZS",
                "status": "linked" if row["platform_customer_id"] else "erp_missing",
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
        )



def downgrade() -> None:
    op.drop_index(op.f("ix_billing_exceptions_tenant_id"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_subscription_id"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_status"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_resolved_at"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_payment_attempt_id"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_exception_type"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_created_at"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_billing_invoice_id"), table_name="billing_exceptions")
    op.drop_index(op.f("ix_billing_exceptions_billing_account_id"), table_name="billing_exceptions")
    op.drop_table("billing_exceptions")

    op.drop_index(op.f("ix_billing_events_tenant_id"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_subscription_id"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_severity"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_payment_attempt_id"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_event_type"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_event_source"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_created_at"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_billing_invoice_id"), table_name="billing_events")
    op.drop_index(op.f("ix_billing_events_billing_account_id"), table_name="billing_events")
    op.drop_table("billing_events")

    op.drop_index(op.f("ix_payment_attempts_updated_at"), table_name="payment_attempts")
    op.drop_index(op.f("ix_payment_attempts_tenant_id"), table_name="payment_attempts")
    op.drop_index(op.f("ix_payment_attempts_subscription_id"), table_name="payment_attempts")
    op.drop_index(op.f("ix_payment_attempts_status"), table_name="payment_attempts")
    op.drop_index(op.f("ix_payment_attempts_provider_reference"), table_name="payment_attempts")
    op.drop_index(op.f("ix_payment_attempts_provider"), table_name="payment_attempts")
    op.drop_index(op.f("ix_payment_attempts_created_at"), table_name="payment_attempts")
    op.drop_index(op.f("ix_payment_attempts_billing_invoice_id"), table_name="payment_attempts")
    op.drop_table("payment_attempts")

    op.drop_index(op.f("ix_billing_invoices_tenant_id"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_subscription_id"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_paid_at"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_last_synced_at"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_issued_at"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_invoice_status"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_invoice_number"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_erp_invoice_id"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_due_date"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_created_at"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_collection_stage"), table_name="billing_invoices")
    op.drop_index(op.f("ix_billing_invoices_billing_account_id"), table_name="billing_invoices")
    op.drop_table("billing_invoices")

    op.drop_index(op.f("ix_billing_accounts_tenant_id"), table_name="billing_accounts")
    op.drop_index(op.f("ix_billing_accounts_status"), table_name="billing_accounts")
    op.drop_index(op.f("ix_billing_accounts_erp_customer_id"), table_name="billing_accounts")
    op.drop_index(op.f("ix_billing_accounts_created_at"), table_name="billing_accounts")
    op.drop_index(op.f("ix_billing_accounts_customer_id"), table_name="billing_accounts")
    op.drop_table("billing_accounts")
