from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260329_0022"
down_revision = "20260322_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_event_outbox",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=True),
        sa.Column("subscription_id", sa.String(length=120), nullable=True),
        sa.Column("customer_ref", sa.String(length=120), nullable=True),
        sa.Column("dedup_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedup_key", name="uq_payment_event_outbox_dedup_key"),
    )
    op.create_index(op.f("ix_payment_event_outbox_provider"), "payment_event_outbox", ["provider"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_event_type"), "payment_event_outbox", ["event_type"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_tenant_id"), "payment_event_outbox", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_subscription_id"), "payment_event_outbox", ["subscription_id"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_customer_ref"), "payment_event_outbox", ["customer_ref"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_dedup_key"), "payment_event_outbox", ["dedup_key"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_status"), "payment_event_outbox", ["status"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_processed_at"), "payment_event_outbox", ["processed_at"], unique=False)
    op.create_index(op.f("ix_payment_event_outbox_created_at"), "payment_event_outbox", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_event_outbox_created_at"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_processed_at"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_status"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_dedup_key"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_customer_ref"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_subscription_id"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_tenant_id"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_event_type"), table_name="payment_event_outbox")
    op.drop_index(op.f("ix_payment_event_outbox_provider"), table_name="payment_event_outbox")
    op.drop_table("payment_event_outbox")
