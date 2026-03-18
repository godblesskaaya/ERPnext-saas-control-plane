from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260315_0013"
down_revision = "20260315_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.add_column(sa.Column("payment_channel", sa.String(length=30), nullable=True))
        batch_op.create_index("ix_tenants_payment_channel", ["payment_channel"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.drop_index("ix_tenants_payment_channel")
        batch_op.drop_column("payment_channel")
