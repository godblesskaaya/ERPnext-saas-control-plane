from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260318_0015"
down_revision = "20260318_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.alter_column("payment_provider", existing_type=sa.String(length=20), server_default="azampay")


def downgrade() -> None:
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.alter_column("payment_provider", existing_type=sa.String(length=20), server_default="selcom")
