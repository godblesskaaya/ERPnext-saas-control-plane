from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260315_0009"
down_revision = "20260315_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "domain_mappings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
        sa.Column("verification_token", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.UniqueConstraint("domain", name="uq_domain_mappings_domain"),
    )
    op.create_index(op.f("ix_domain_mappings_tenant_id"), "domain_mappings", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_domain_mappings_status"), "domain_mappings", ["status"], unique=False)

    op.create_table(
        "support_notes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=True),
        sa.Column("author_role", sa.String(length=30), nullable=False, server_default="admin"),
        sa.Column("category", sa.String(length=30), nullable=False, server_default="note"),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
    )
    op.create_index(op.f("ix_support_notes_tenant_id"), "support_notes", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_support_notes_author_id"), "support_notes", ["author_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_support_notes_author_id"), table_name="support_notes")
    op.drop_index(op.f("ix_support_notes_tenant_id"), table_name="support_notes")
    op.drop_table("support_notes")
    op.drop_index(op.f("ix_domain_mappings_status"), table_name="domain_mappings")
    op.drop_index(op.f("ix_domain_mappings_tenant_id"), table_name="domain_mappings")
    op.drop_table("domain_mappings")
