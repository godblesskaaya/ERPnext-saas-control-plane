from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260306_0004"
down_revision = "20260306_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backups",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("file_path", sa.String(length=1024), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("s3_key", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_backups_tenant_id"), "backups", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_backups_job_id"), "backups", ["job_id"], unique=False)
    op.create_index(op.f("ix_backups_created_at"), "backups", ["created_at"], unique=False)
    op.create_index(op.f("ix_backups_expires_at"), "backups", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_backups_expires_at"), table_name="backups")
    op.drop_index(op.f("ix_backups_created_at"), table_name="backups")
    op.drop_index(op.f("ix_backups_job_id"), table_name="backups")
    op.drop_index(op.f("ix_backups_tenant_id"), table_name="backups")
    op.drop_table("backups")
