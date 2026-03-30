from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260329_0023"
down_revision = "20260329_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("notification_email_alerts", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(sa.Column("notification_sms_alerts", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(
            sa.Column("notification_billing_alerts", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("notification_provisioning_alerts", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("notification_support_alerts", sa.Boolean(), nullable=False, server_default=sa.true())
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("notification_support_alerts")
        batch_op.drop_column("notification_provisioning_alerts")
        batch_op.drop_column("notification_billing_alerts")
        batch_op.drop_column("notification_sms_alerts")
        batch_op.drop_column("notification_email_alerts")
