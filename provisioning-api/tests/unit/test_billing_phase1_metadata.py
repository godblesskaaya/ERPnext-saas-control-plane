from __future__ import annotations

from app.db import Base
from app import models  # noqa: F401


def test_billing_phase1_tables_registered_in_metadata() -> None:
    tables = Base.metadata.tables

    assert "billing_accounts" in tables
    assert "billing_invoices" in tables
    assert "payment_attempts" in tables
    assert "billing_events" in tables
    assert "billing_exceptions" in tables
