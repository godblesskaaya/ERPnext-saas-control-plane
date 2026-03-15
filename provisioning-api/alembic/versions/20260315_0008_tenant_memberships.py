from __future__ import annotations

from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260315_0008"
down_revision = "20260308_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tenant_role_enum = sa.Enum("owner", "admin", "billing", "technical", name="tenant_role")

    op.create_table(
        "organizations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
    )

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("tenants", recreate="always") as batch_op:
            batch_op.add_column(sa.Column("organization_id", sa.String(length=36), nullable=True))
            batch_op.create_index(op.f("ix_tenants_organization_id"), ["organization_id"], unique=False)
            batch_op.create_foreign_key("fk_tenants_organization_id", "organizations", ["organization_id"], ["id"])
    else:
        op.add_column("tenants", sa.Column("organization_id", sa.String(length=36), nullable=True))
        op.create_index(op.f("ix_tenants_organization_id"), "tenants", ["organization_id"], unique=False)
        op.create_foreign_key("fk_tenants_organization_id", "tenants", "organizations", ["organization_id"], ["id"])

    op.create_table(
        "tenant_memberships",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role", tenant_role_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_tenant_memberships_tenant_user"),
    )
    op.create_index(op.f("ix_tenant_memberships_role"), "tenant_memberships", ["role"], unique=False)

    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    rows = conn.execute(sa.text("SELECT id, company_name, owner_id FROM tenants")).fetchall()
    for row in rows:
        org_id = str(uuid.uuid4())
        conn.execute(
            sa.text(
                "INSERT INTO organizations (id, name, owner_id, created_at, updated_at) "
                "VALUES (:id, :name, :owner_id, :created_at, :updated_at)"
            ),
            {
                "id": org_id,
                "name": row.company_name,
                "owner_id": row.owner_id,
                "created_at": now,
                "updated_at": now,
            },
        )
        conn.execute(
            sa.text("UPDATE tenants SET organization_id = :org_id WHERE id = :tenant_id"),
            {"org_id": org_id, "tenant_id": row.id},
        )
        conn.execute(
            sa.text(
                "INSERT INTO tenant_memberships (id, tenant_id, user_id, role, created_at, updated_at) "
                "VALUES (:id, :tenant_id, :user_id, :role, :created_at, :updated_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "tenant_id": row.id,
                "user_id": row.owner_id,
                "role": "owner",
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_memberships_role"), table_name="tenant_memberships")
    op.drop_table("tenant_memberships")
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("tenants", recreate="always") as batch_op:
            batch_op.drop_constraint("fk_tenants_organization_id", type_="foreignkey")
            batch_op.drop_index(op.f("ix_tenants_organization_id"))
            batch_op.drop_column("organization_id")
    else:
        op.drop_constraint("fk_tenants_organization_id", "tenants", type_="foreignkey")
        op.drop_index(op.f("ix_tenants_organization_id"), table_name="tenants")
        op.drop_column("tenants", "organization_id")
    op.drop_table("organizations")
