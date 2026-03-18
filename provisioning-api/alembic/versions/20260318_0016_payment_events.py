from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260318_0016"
down_revision = "20260318_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("processing_status", sa.String(length=20), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=True),
        sa.Column("subscription_id", sa.String(length=120), nullable=True),
        sa.Column("customer_ref", sa.String(length=120), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("request_headers", sa.JSON(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_events_provider"), "payment_events", ["provider"], unique=False)
    op.create_index(op.f("ix_payment_events_event_type"), "payment_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_payment_events_processing_status"), "payment_events", ["processing_status"], unique=False)
    op.create_index(op.f("ix_payment_events_tenant_id"), "payment_events", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_payment_events_subscription_id"), "payment_events", ["subscription_id"], unique=False)
    op.create_index(op.f("ix_payment_events_customer_ref"), "payment_events", ["customer_ref"], unique=False)
    op.create_index(op.f("ix_payment_events_created_at"), "payment_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_events_created_at"), table_name="payment_events")
    op.drop_index(op.f("ix_payment_events_customer_ref"), table_name="payment_events")
    op.drop_index(op.f("ix_payment_events_subscription_id"), table_name="payment_events")
    op.drop_index(op.f("ix_payment_events_tenant_id"), table_name="payment_events")
    op.drop_index(op.f("ix_payment_events_processing_status"), table_name="payment_events")
    op.drop_index(op.f("ix_payment_events_event_type"), table_name="payment_events")
    op.drop_index(op.f("ix_payment_events_provider"), table_name="payment_events")
    op.drop_table("payment_events")
