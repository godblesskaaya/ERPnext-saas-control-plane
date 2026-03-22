from __future__ import annotations

from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260322_0018"
down_revision = "20260322_0017"
branch_labels = None
depends_on = None


FEATURE_REGISTRY = [
    ("weekly_backup", False, "Weekly managed backups"),
    ("daily_backup", False, "Daily backup capability"),
    ("one_extra_app", False, "One selectable extra app"),
    ("s3_backup", False, "S3 offsite backup"),
    ("all_apps", False, "All app entitlements"),
    ("custom_domain", False, "Custom domain support"),
    ("sla_support", False, "SLA-backed support"),
    ("whatsapp_support", False, "WhatsApp support channel"),
    ("independent_upgrades", False, "Independent tenant upgrades"),
    ("dedicated_infra", False, "Dedicated infrastructure"),
    ("sso_login", False, "Future SSO login capability"),
    ("advanced_reporting", False, "Future advanced reporting capability"),
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("default_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_index(op.f("ix_feature_flags_key"), "feature_flags", ["key"], unique=True)
    op.create_index(op.f("ix_feature_flags_default_enabled"), "feature_flags", ["default_enabled"], unique=False)

    op.create_table(
        "tenant_features",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("feature_id", sa.String(length=36), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["feature_id"], ["feature_flags.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "feature_id", name="uq_tenant_features_tenant_feature"),
    )
    op.create_index(op.f("ix_tenant_features_tenant_id"), "tenant_features", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_tenant_features_feature_id"), "tenant_features", ["feature_id"], unique=False)
    op.create_index(op.f("ix_tenant_features_enabled"), "tenant_features", ["enabled"], unique=False)

    flags_table = sa.table(
        "feature_flags",
        sa.column("id", sa.String(length=36)),
        sa.column("key", sa.String(length=80)),
        sa.column("default_enabled", sa.Boolean()),
        sa.column("description", sa.String(length=255)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    now = _utcnow()
    op.get_bind().execute(
        sa.insert(flags_table),
        [
            {
                "id": str(uuid.uuid4()),
                "key": key,
                "default_enabled": default_enabled,
                "description": description,
                "created_at": now,
                "updated_at": now,
            }
            for key, default_enabled, description in FEATURE_REGISTRY
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_features_enabled"), table_name="tenant_features")
    op.drop_index(op.f("ix_tenant_features_feature_id"), table_name="tenant_features")
    op.drop_index(op.f("ix_tenant_features_tenant_id"), table_name="tenant_features")
    op.drop_table("tenant_features")

    op.drop_index(op.f("ix_feature_flags_default_enabled"), table_name="feature_flags")
    op.drop_index(op.f("ix_feature_flags_key"), table_name="feature_flags")
    op.drop_table("feature_flags")

