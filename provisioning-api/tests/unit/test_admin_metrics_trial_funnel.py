from __future__ import annotations

from datetime import datetime, timedelta, timezone
import importlib

from app.models import Tenant, User
from app.modules.subscription.models import Subscription
from app.modules.subscription.service import get_plan_by_slug

def _admin_headers(client, db_session):
    client.post("/auth/signup", json={"email": "admin-metrics@example.com", "password": "Secret123!"})
    admin = db_session.query(User).filter(User.email == "admin-metrics@example.com").one()
    admin.role = "admin"
    db_session.add(admin)
    db_session.commit()
    login = client.post("/auth/login", json={"email": "admin-metrics@example.com", "password": "Secret123!"})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_metrics_exposes_trial_funnel_counts(client, db_session, monkeypatch):
    admin_router_module = importlib.import_module("app.modules.support.admin_router")

    class DummyDLQ:
        count = 0

    monkeypatch.setattr(admin_router_module, "get_dlq", lambda: DummyDLQ())

    owner = User(email="trial-owner@example.com", password_hash="hash", role="user")
    db_session.add(owner)
    db_session.flush()
    starter_plan = get_plan_by_slug(db_session, "starter", active_only=False)
    assert starter_plan is not None

    now = datetime.now(timezone.utc)
    scenarios = [
        ("trialing", now + timedelta(days=3)),
        ("active", now - timedelta(days=1)),
        ("past_due", now - timedelta(days=2)),
        ("cancelled", now - timedelta(days=4)),
    ]
    for idx, (subscription_status, trial_ends_at) in enumerate(scenarios):
        tenant = Tenant(
            owner_id=owner.id,
            subdomain=f"trial-metric-{idx}",
            domain=f"trial-metric-{idx}.erp.blenkotechnologies.co.tz",
            site_name=f"trial-metric-{idx}.erp.blenkotechnologies.co.tz",
            company_name=f"Trial Metric {idx}",
            status="active",
            payment_provider="stripe",
        )
        db_session.add(tenant)
        db_session.flush()
        db_session.add(
            Subscription(
                tenant_id=tenant.id,
                plan_id=starter_plan.id,
                status=subscription_status,
                trial_ends_at=trial_ends_at,
                payment_provider="stripe",
            )
        )

    db_session.commit()
    response = client.get("/admin/metrics", headers=_admin_headers(client, db_session))
    assert response.status_code == 200
    payload = response.json()

    assert payload["trialing_tenants"] == 1
    assert payload["trial_converted_tenants"] == 1
    assert payload["trial_expired_past_due_tenants"] == 1
    assert payload["trial_cancelled_tenants"] == 1
