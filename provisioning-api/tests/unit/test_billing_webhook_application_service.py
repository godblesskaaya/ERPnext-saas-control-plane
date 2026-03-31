from __future__ import annotations

from fastapi import BackgroundTasks
from starlette.requests import Request

from app.schemas import MessageResponse
import app.modules.billing.webhook_application_service as webhook_app


def _request() -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "path": "/billing/webhook/stripe",
        "headers": [],
        "query_string": b"",
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


def test_process_event_dispatches_payment_confirmed_entrypoint(db_session, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def _fake_handle_payment_confirmed(**kwargs):
        captured.update(kwargs)
        return MessageResponse(message="processed:delegated-confirmed")

    monkeypatch.setattr(webhook_app, "handle_payment_confirmed", _fake_handle_payment_confirmed)

    response = webhook_app.process_event(
        request=_request(),
        background_tasks=BackgroundTasks(),
        db=db_session,
        event_type="payment.confirmed",
        tenant_id="tenant-1",
        subscription_id="sub-1",
        customer_ref="cus-1",
        raw={"k": "v"},
    )

    assert response.message == "processed:delegated-confirmed"
    assert captured["tenant_id"] == "tenant-1"
    assert captured["subscription_id"] == "sub-1"
    assert captured["customer_ref"] == "cus-1"
    assert captured["raw"] == {"k": "v"}
    assert captured["db"] is db_session


def test_process_event_dispatches_payment_failed_entrypoint(db_session, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def _fake_handle_payment_failed(**kwargs):
        captured.update(kwargs)
        return MessageResponse(message="processed:delegated-failed")

    monkeypatch.setattr(webhook_app, "handle_payment_failed", _fake_handle_payment_failed)
    background_tasks = BackgroundTasks()

    response = webhook_app.process_event(
        request=_request(),
        background_tasks=background_tasks,
        db=db_session,
        event_type="payment.failed",
        tenant_id="tenant-2",
        subscription_id="sub-2",
        customer_ref="cus-ignored",
        raw={"ignored": True},
    )

    assert response.message == "processed:delegated-failed"
    assert captured["tenant_id"] == "tenant-2"
    assert captured["subscription_id"] == "sub-2"
    assert captured["background_tasks"] is background_tasks
    assert captured["db"] is db_session


def test_process_event_dispatches_subscription_cancelled_entrypoint(db_session, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def _fake_handle_subscription_cancelled(**kwargs):
        captured.update(kwargs)
        return MessageResponse(message="processed:delegated-cancelled")

    monkeypatch.setattr(webhook_app, "handle_subscription_cancelled", _fake_handle_subscription_cancelled)
    background_tasks = BackgroundTasks()

    response = webhook_app.process_event(
        request=_request(),
        background_tasks=background_tasks,
        db=db_session,
        event_type="subscription.cancelled",
        tenant_id="tenant-3",
        subscription_id="sub-3",
        customer_ref=None,
        raw={"ignored": True},
    )

    assert response.message == "processed:delegated-cancelled"
    assert captured["tenant_id"] == "tenant-3"
    assert captured["subscription_id"] == "sub-3"
    assert captured["background_tasks"] is background_tasks
    assert captured["db"] is db_session


def test_process_event_returns_ignored_for_unhandled_type(db_session) -> None:
    response = webhook_app.process_event(
        request=_request(),
        background_tasks=BackgroundTasks(),
        db=db_session,
        event_type="invoice.created",
        tenant_id="tenant-4",
        subscription_id="sub-4",
        customer_ref=None,
        raw={"k": "v"},
    )

    assert response.message == "ignored"
