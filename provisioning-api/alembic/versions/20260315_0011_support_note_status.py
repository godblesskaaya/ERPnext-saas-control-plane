from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260315_0011"
down_revision = "20260315_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("support_notes") as batch_op:
        batch_op.add_column(sa.Column("status", sa.String(length=20), nullable=False, server_default="open"))
        batch_op.add_column(sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_support_notes_status", ["status"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("support_notes") as batch_op:
        batch_op.drop_index("ix_support_notes_status")
        batch_op.drop_column("resolved_at")
        batch_op.drop_column("status")
