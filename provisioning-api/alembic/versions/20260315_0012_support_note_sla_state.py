from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260315_0012"
down_revision = "20260315_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("support_notes") as batch_op:
        batch_op.add_column(sa.Column("sla_state", sa.String(length=20), nullable=False, server_default="unscheduled"))
        batch_op.add_column(sa.Column("sla_last_evaluated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_support_notes_sla_state", ["sla_state"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("support_notes") as batch_op:
        batch_op.drop_index("ix_support_notes_sla_state")
        batch_op.drop_column("sla_last_evaluated_at")
        batch_op.drop_column("sla_state")
