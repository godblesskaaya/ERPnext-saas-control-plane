from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260307_0005"
down_revision = "20260306_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("chosen_app", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "chosen_app")

