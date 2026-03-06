from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260306_0003"
down_revision = "20260306_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(length=120), nullable=True))
    op.create_index(op.f("ix_users_stripe_customer_id"), "users", ["stripe_customer_id"], unique=False)

    op.add_column("tenants", sa.Column("billing_status", sa.String(length=30), nullable=False, server_default="unpaid"))
    op.add_column("tenants", sa.Column("stripe_checkout_session_id", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("stripe_subscription_id", sa.String(length=120), nullable=True))
    op.create_index(
        op.f("ix_tenants_stripe_checkout_session_id"),
        "tenants",
        ["stripe_checkout_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tenants_stripe_subscription_id"),
        "tenants",
        ["stripe_subscription_id"],
        unique=False,
    )
    op.create_index(op.f("ix_tenants_billing_status"), "tenants", ["billing_status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenants_billing_status"), table_name="tenants")
    op.drop_index(op.f("ix_tenants_stripe_subscription_id"), table_name="tenants")
    op.drop_index(op.f("ix_tenants_stripe_checkout_session_id"), table_name="tenants")
    op.drop_column("tenants", "stripe_subscription_id")
    op.drop_column("tenants", "stripe_checkout_session_id")
    op.drop_column("tenants", "billing_status")

    op.drop_index(op.f("ix_users_stripe_customer_id"), table_name="users")
    op.drop_column("users", "stripe_customer_id")
