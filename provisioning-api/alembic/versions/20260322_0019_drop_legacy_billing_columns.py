from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260322_0019"
down_revision = "20260322_0018"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    tenants_indexes = (
        "ix_tenants_billing_status",
        "ix_tenants_stripe_checkout_session_id",
        "ix_tenants_stripe_subscription_id",
    )
    for index_name in tenants_indexes:
        if _index_exists("tenants", index_name):
            op.drop_index(index_name, table_name="tenants")

    if _index_exists("users", "ix_users_stripe_customer_id"):
        op.drop_index("ix_users_stripe_customer_id", table_name="users")

    with op.batch_alter_table("tenants") as batch_op:
        if _column_exists("tenants", "billing_status"):
            batch_op.drop_column("billing_status")
        if _column_exists("tenants", "stripe_checkout_session_id"):
            batch_op.drop_column("stripe_checkout_session_id")
        if _column_exists("tenants", "stripe_subscription_id"):
            batch_op.drop_column("stripe_subscription_id")

    with op.batch_alter_table("users") as batch_op:
        if _column_exists("users", "stripe_customer_id"):
            batch_op.drop_column("stripe_customer_id")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        if not _column_exists("users", "stripe_customer_id"):
            batch_op.add_column(sa.Column("stripe_customer_id", sa.String(length=120), nullable=True))
    if not _index_exists("users", "ix_users_stripe_customer_id"):
        op.create_index("ix_users_stripe_customer_id", "users", ["stripe_customer_id"], unique=False)

    with op.batch_alter_table("tenants") as batch_op:
        if not _column_exists("tenants", "billing_status"):
            batch_op.add_column(
                sa.Column(
                    "billing_status",
                    sa.String(length=30),
                    nullable=False,
                    server_default="unpaid",
                )
            )
        if not _column_exists("tenants", "stripe_checkout_session_id"):
            batch_op.add_column(sa.Column("stripe_checkout_session_id", sa.String(length=120), nullable=True))
        if not _column_exists("tenants", "stripe_subscription_id"):
            batch_op.add_column(sa.Column("stripe_subscription_id", sa.String(length=120), nullable=True))

    if not _index_exists("tenants", "ix_tenants_billing_status"):
        op.create_index("ix_tenants_billing_status", "tenants", ["billing_status"], unique=False)
    if not _index_exists("tenants", "ix_tenants_stripe_checkout_session_id"):
        op.create_index("ix_tenants_stripe_checkout_session_id", "tenants", ["stripe_checkout_session_id"], unique=False)
    if not _index_exists("tenants", "ix_tenants_stripe_subscription_id"):
        op.create_index("ix_tenants_stripe_subscription_id", "tenants", ["stripe_subscription_id"], unique=False)
