from __future__ import annotations

from unittest.mock import patch

import pytest
from starlette.websockets import WebSocketDisconnect

from app.config import get_settings
from app.models import Job, Tenant, User
from app.security import create_access_token


class FakePubSub:
    def __init__(self):
        self._messages = iter(
            [
                {"type": "message", "data": b"log line 1"},
                {"type": "message", "data": b"__DONE__"},
            ]
        )

    def subscribe(self, _channel: str):
        return None

    def get_message(self, ignore_subscribe_messages=True, timeout=1.0):
        try:
            return next(self._messages)
        except StopIteration:
            return None

    def unsubscribe(self):
        return None

    def close(self):
        return None


class FakeRedis:
    def pubsub(self):
        return FakePubSub()


@patch("app.routers.ws.get_redis_connection", return_value=FakeRedis())
def test_ws_job_stream_for_authorized_user(_, client, db_session):
    user = User(email="ws@example.com", password_hash="hash", role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tenant = Tenant(
        owner_id=user.id,
        subdomain="ws",
        domain="ws.erp.blenkotechnologies.co.tz",
        site_name="ws.erp.blenkotechnologies.co.tz",
        company_name="WS Ltd",
        plan="starter",
        status="provisioning",
        billing_status="paid",
    )
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    job = Job(tenant_id=tenant.id, type="create", status="running")
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    token = create_access_token(subject=user.id, role=user.role)
    with client.websocket_connect(f"/ws/jobs/{job.id}", subprotocols=[f"bearer.{token}"]) as ws:
        assert ws.receive_text() == "log line 1"
        assert ws.receive_text() == "__DONE__"


def test_ws_job_stream_rejects_invalid_token(client):
    with client.websocket_connect("/ws/jobs/does-not-matter", subprotocols=["bearer.invalid"]) as ws:
        with pytest.raises(WebSocketDisconnect):
            ws.receive_text()


def test_ws_job_stream_rejects_query_token_in_production(monkeypatch, client):
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    with client.websocket_connect("/ws/jobs/does-not-matter?token=legacy-query-token") as ws:
        with pytest.raises(WebSocketDisconnect):
            ws.receive_text()
    get_settings.cache_clear()
