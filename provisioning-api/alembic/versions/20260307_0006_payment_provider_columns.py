from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260307_0006"
down_revision = "20260307_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("payment_provider", sa.String(length=20), nullable=False, server_default="stripe"),
    )
    op.add_column("tenants", sa.Column("dpo_transaction_token", sa.String(length=120), nullable=True))
    op.create_index(op.f("ix_tenants_payment_provider"), "tenants", ["payment_provider"], unique=False)
    op.create_index(op.f("ix_tenants_dpo_transaction_token"), "tenants", ["dpo_transaction_token"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenants_dpo_transaction_token"), table_name="tenants")
    op.drop_index(op.f("ix_tenants_payment_provider"), table_name="tenants")
    op.drop_column("tenants", "dpo_transaction_token")
    op.drop_column("tenants", "payment_provider")

