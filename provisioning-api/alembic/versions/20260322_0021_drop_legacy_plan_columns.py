from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260322_0021"
down_revision = "20260322_0020"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    with op.batch_alter_table("tenants") as batch_op:
        if _column_exists("tenants", "plan"):
            batch_op.drop_column("plan")
        if _column_exists("tenants", "chosen_app"):
            batch_op.drop_column("chosen_app")


def downgrade() -> None:
    with op.batch_alter_table("tenants") as batch_op:
        if not _column_exists("tenants", "plan"):
            batch_op.add_column(sa.Column("plan", sa.String(length=30), nullable=False, server_default="starter"))
        if not _column_exists("tenants", "chosen_app"):
            batch_op.add_column(sa.Column("chosen_app", sa.String(length=50), nullable=True))
