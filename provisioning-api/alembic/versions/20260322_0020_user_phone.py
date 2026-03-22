from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260322_0020"
down_revision = "20260322_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("phone", sa.String(length=32), nullable=True))
    op.create_index("ix_users_phone", "users", ["phone"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_phone", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("phone")
