from __future__ import annotations

from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260322_0017"
down_revision = "20260318_0016"
branch_labels = None
depends_on = None


PLAN_IDS = {
    "starter": "fce42a4f-b8d7-4d45-b862-b22a3fef2d25",
    "business": "2ebf004f-45de-4c7b-9efd-955018f8c966",
    "enterprise": "008bfb6d-4f9f-4137-ad67-dc6f18329b97",
}

BUSINESS_APP_SLUGS = (
    "crm",
    "hrms",
    "frappe_whatsapp",
    "posawesome",
    "lms",
    "helpdesk",
    "payments",
    "lending",
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_plan_slug(raw_plan: str | None) -> str:
    candidate = (raw_plan or "").strip().lower()
    return candidate if candidate in PLAN_IDS else "starter"


def _map_subscription_status(raw_status: str | None) -> str:
    # Legacy tenant.billing_status -> subscription.status mapping:
    # paid -> active, failed -> past_due, cancelled -> cancelled, everything else -> pending.
    normalized = (raw_status or "").strip().lower()
    return {
        "paid": "active",
        "failed": "past_due",
        "cancelled": "cancelled",
    }.get(normalized, "pending")


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=30), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("isolation_model", sa.String(length=30), nullable=False),
        sa.Column("max_extra_apps", sa.Integer(), nullable=True),
        sa.Column("monthly_price_usd_cents", sa.Integer(), nullable=False),
        sa.Column("monthly_price_tzs", sa.Integer(), nullable=False),
        sa.Column("stripe_price_id", sa.String(length=120), nullable=True),
        sa.Column("dpo_product_code", sa.String(length=120), nullable=True),
        sa.Column("backup_frequency", sa.String(length=20), nullable=False),
        sa.Column("backup_retention_days", sa.Integer(), nullable=False),
        sa.Column("includes_s3_offsite_backup", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("support_channel", sa.String(length=40), nullable=False),
        sa.Column("sla_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("custom_domain_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_plans_slug"), "plans", ["slug"], unique=True)
    op.create_index(op.f("ix_plans_is_active"), "plans", ["is_active"], unique=False)

    op.create_table(
        "plan_entitlements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("app_slug", sa.String(length=50), nullable=False),
        sa.Column("mandatory", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("selectable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "app_slug", name="uq_plan_entitlements_plan_app"),
    )
    op.create_index(op.f("ix_plan_entitlements_plan_id"), "plan_entitlements", ["plan_id"], unique=False)
    op.create_index(op.f("ix_plan_entitlements_app_slug"), "plan_entitlements", ["app_slug"], unique=False)

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("selected_app", sa.String(length=50), nullable=True),
        sa.Column("payment_provider", sa.String(length=30), nullable=True),
        sa.Column("provider_subscription_id", sa.String(length=120), nullable=True),
        sa.Column("provider_customer_id", sa.String(length=120), nullable=True),
        sa.Column("provider_checkout_session_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_subscriptions_tenant_id"),
    )
    op.create_index(op.f("ix_subscriptions_plan_id"), "subscriptions", ["plan_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_status"), "subscriptions", ["status"], unique=False)
    op.create_index(op.f("ix_subscriptions_payment_provider"), "subscriptions", ["payment_provider"], unique=False)
    op.create_index(
        op.f("ix_subscriptions_provider_subscription_id"),
        "subscriptions",
        ["provider_subscription_id"],
        unique=False,
    )
    op.create_index(op.f("ix_subscriptions_provider_customer_id"), "subscriptions", ["provider_customer_id"], unique=False)
    op.create_index(
        op.f("ix_subscriptions_provider_checkout_session_id"),
        "subscriptions",
        ["provider_checkout_session_id"],
        unique=False,
    )

    bind = op.get_bind()
    now = _utcnow()

    plans_table = sa.table(
        "plans",
        sa.column("id", sa.String(length=36)),
        sa.column("slug", sa.String(length=30)),
        sa.column("display_name", sa.String(length=120)),
        sa.column("is_active", sa.Boolean()),
        sa.column("isolation_model", sa.String(length=30)),
        sa.column("max_extra_apps", sa.Integer()),
        sa.column("monthly_price_usd_cents", sa.Integer()),
        sa.column("monthly_price_tzs", sa.Integer()),
        sa.column("stripe_price_id", sa.String(length=120)),
        sa.column("dpo_product_code", sa.String(length=120)),
        sa.column("backup_frequency", sa.String(length=20)),
        sa.column("backup_retention_days", sa.Integer()),
        sa.column("includes_s3_offsite_backup", sa.Boolean()),
        sa.column("support_channel", sa.String(length=40)),
        sa.column("sla_enabled", sa.Boolean()),
        sa.column("custom_domain_enabled", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    plan_seed_rows = [
        {
            "id": PLAN_IDS["starter"],
            "slug": "starter",
            "display_name": "Starter",
            "is_active": True,
            "isolation_model": "pooled",
            "max_extra_apps": 0,
            "monthly_price_usd_cents": 4900,
            "monthly_price_tzs": 125000,
            "stripe_price_id": "starter_monthly",
            "dpo_product_code": "starter",
            "backup_frequency": "weekly",
            "backup_retention_days": 7,
            "includes_s3_offsite_backup": False,
            "support_channel": "email",
            "sla_enabled": False,
            "custom_domain_enabled": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": PLAN_IDS["business"],
            "slug": "business",
            "display_name": "Business",
            "is_active": True,
            "isolation_model": "pooled",
            "max_extra_apps": 1,
            "monthly_price_usd_cents": 14900,
            "monthly_price_tzs": 380000,
            "stripe_price_id": "business_monthly",
            "dpo_product_code": "business",
            "backup_frequency": "daily",
            "backup_retention_days": 30,
            "includes_s3_offsite_backup": False,
            "support_channel": "priority_email",
            "sla_enabled": False,
            "custom_domain_enabled": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": PLAN_IDS["enterprise"],
            "slug": "enterprise",
            "display_name": "Enterprise",
            "is_active": True,
            "isolation_model": "silo_compose",
            "max_extra_apps": None,
            "monthly_price_usd_cents": 0,
            "monthly_price_tzs": 0,
            "stripe_price_id": "enterprise_monthly",
            "dpo_product_code": "enterprise",
            "backup_frequency": "daily",
            "backup_retention_days": 90,
            "includes_s3_offsite_backup": True,
            "support_channel": "whatsapp",
            "sla_enabled": True,
            "custom_domain_enabled": True,
            "created_at": now,
            "updated_at": now,
        },
    ]
    bind.execute(sa.insert(plans_table), plan_seed_rows)

    entitlements_table = sa.table(
        "plan_entitlements",
        sa.column("id", sa.String(length=36)),
        sa.column("plan_id", sa.String(length=36)),
        sa.column("app_slug", sa.String(length=50)),
        sa.column("mandatory", sa.Boolean()),
        sa.column("selectable", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    entitlement_rows: list[dict[str, object | None]] = []

    entitlement_rows.append(
        {
            "id": str(uuid.uuid4()),
            "plan_id": PLAN_IDS["starter"],
            "app_slug": "erpnext",
            "mandatory": True,
            "selectable": False,
            "created_at": now,
            "updated_at": now,
        }
    )
    entitlement_rows.append(
        {
            "id": str(uuid.uuid4()),
            "plan_id": PLAN_IDS["business"],
            "app_slug": "erpnext",
            "mandatory": True,
            "selectable": False,
            "created_at": now,
            "updated_at": now,
        }
    )
    entitlement_rows.append(
        {
            "id": str(uuid.uuid4()),
            "plan_id": PLAN_IDS["enterprise"],
            "app_slug": "erpnext",
            "mandatory": True,
            "selectable": False,
            "created_at": now,
            "updated_at": now,
        }
    )

    for app_slug in BUSINESS_APP_SLUGS:
        entitlement_rows.append(
            {
                "id": str(uuid.uuid4()),
                "plan_id": PLAN_IDS["business"],
                "app_slug": app_slug,
                "mandatory": False,
                "selectable": True,
                "created_at": now,
                "updated_at": now,
            }
        )
        entitlement_rows.append(
            {
                "id": str(uuid.uuid4()),
                "plan_id": PLAN_IDS["enterprise"],
                "app_slug": app_slug,
                "mandatory": True,
                "selectable": False,
                "created_at": now,
                "updated_at": now,
            }
        )

    bind.execute(sa.insert(entitlements_table), entitlement_rows)

    tenants_table = sa.table(
        "tenants",
        sa.column("id", sa.String(length=36)),
        sa.column("owner_id", sa.String(length=36)),
        sa.column("plan", sa.String(length=30)),
        sa.column("chosen_app", sa.String(length=50)),
        sa.column("billing_status", sa.String(length=30)),
        sa.column("payment_provider", sa.String(length=20)),
        sa.column("dpo_transaction_token", sa.String(length=120)),
        sa.column("stripe_checkout_session_id", sa.String(length=120)),
        sa.column("stripe_subscription_id", sa.String(length=120)),
        sa.column("platform_customer_id", sa.String(length=120)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    existing_tenants = bind.execute(
        sa.select(
            tenants_table.c.id,
            tenants_table.c.owner_id,
            tenants_table.c.plan,
            tenants_table.c.chosen_app,
            tenants_table.c.billing_status,
            tenants_table.c.payment_provider,
            tenants_table.c.dpo_transaction_token,
            tenants_table.c.stripe_checkout_session_id,
            tenants_table.c.stripe_subscription_id,
            tenants_table.c.platform_customer_id,
            tenants_table.c.created_at,
            tenants_table.c.updated_at,
        )
    ).mappings()

    subscriptions_table = sa.table(
        "subscriptions",
        sa.column("id", sa.String(length=36)),
        sa.column("tenant_id", sa.String(length=36)),
        sa.column("plan_id", sa.String(length=36)),
        sa.column("status", sa.String(length=30)),
        sa.column("trial_ends_at", sa.DateTime(timezone=True)),
        sa.column("current_period_start", sa.DateTime(timezone=True)),
        sa.column("current_period_end", sa.DateTime(timezone=True)),
        sa.column("cancelled_at", sa.DateTime(timezone=True)),
        sa.column("selected_app", sa.String(length=50)),
        sa.column("payment_provider", sa.String(length=30)),
        sa.column("provider_subscription_id", sa.String(length=120)),
        sa.column("provider_customer_id", sa.String(length=120)),
        sa.column("provider_checkout_session_id", sa.String(length=120)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    users_table = sa.table(
        "users",
        sa.column("id", sa.String(length=36)),
        sa.column("stripe_customer_id", sa.String(length=120)),
    )
    owner_customer_map = {
        row["id"]: (row["stripe_customer_id"] or "").strip() or None
        for row in bind.execute(sa.select(users_table.c.id, users_table.c.stripe_customer_id)).mappings()
    }

    subscription_rows: list[dict[str, object | None]] = []
    # Data transformation: create one subscription record for each existing tenant so
    # subscription state can become the new source of truth without dropping legacy columns yet.
    for tenant in existing_tenants:
        plan_slug = _normalize_plan_slug(tenant["plan"])
        payment_provider = (tenant["payment_provider"] or "").strip().lower() or None
        stripe_checkout_session = (tenant["stripe_checkout_session_id"] or "").strip() or None
        dpo_transaction_token = (tenant["dpo_transaction_token"] or "").strip() or None

        subscription_rows.append(
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant["id"],
                "plan_id": PLAN_IDS[plan_slug],
                "status": _map_subscription_status(tenant["billing_status"]),
                "trial_ends_at": None,
                "current_period_start": None,
                "current_period_end": None,
                "cancelled_at": None,
                "selected_app": (tenant["chosen_app"] or "").strip().lower() or None,
                "payment_provider": payment_provider,
                "provider_subscription_id": (tenant["stripe_subscription_id"] or "").strip() or None,
                "provider_customer_id": owner_customer_map.get(tenant["owner_id"]) if payment_provider == "stripe" else None,
                "provider_checkout_session_id": stripe_checkout_session or dpo_transaction_token,
                "created_at": tenant["created_at"] or now,
                "updated_at": tenant["updated_at"] or now,
            }
        )

    if subscription_rows:
        bind.execute(sa.insert(subscriptions_table), subscription_rows)


def downgrade() -> None:
    op.drop_index(op.f("ix_subscriptions_provider_checkout_session_id"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_provider_customer_id"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_provider_subscription_id"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_payment_provider"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_status"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_plan_id"), table_name="subscriptions")
    op.drop_table("subscriptions")

    op.drop_index(op.f("ix_plan_entitlements_app_slug"), table_name="plan_entitlements")
    op.drop_index(op.f("ix_plan_entitlements_plan_id"), table_name="plan_entitlements")
    op.drop_table("plan_entitlements")

    op.drop_index(op.f("ix_plans_is_active"), table_name="plans")
    op.drop_index(op.f("ix_plans_slug"), table_name="plans")
    op.drop_table("plans")
