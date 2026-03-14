from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260308_0007"
down_revision = "20260307_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_users_email_verified"), "users", ["email_verified"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_email_verified"), table_name="users")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email_verified")
