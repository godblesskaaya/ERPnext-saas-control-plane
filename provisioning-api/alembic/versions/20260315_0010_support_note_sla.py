from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260315_0010"
down_revision = "20260315_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("support_notes") as batch_op:
        batch_op.add_column(sa.Column("owner_name", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("owner_contact", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("support_notes") as batch_op:
        batch_op.drop_column("sla_due_at")
        batch_op.drop_column("owner_contact")
        batch_op.drop_column("owner_name")
