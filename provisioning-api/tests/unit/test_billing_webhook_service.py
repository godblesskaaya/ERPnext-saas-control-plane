from __future__ import annotations

from app.modules.billing import webhook_application_service
from app.modules.billing.webhook_service import build_outbox_dedup_key, decode_payload, sanitize_headers, to_minor_units
from app.schemas import MessageResponse


def test_sanitize_headers_filters_secrets_and_normalizes_keys():
    headers = {
        "Authorization": "Bearer top-secret",
        "Cookie": "session=abc",
        "Set-Cookie": "session=abc",
        "X-Api-Key": "api-key",
        "Content-Type": "application/json",
        "X-Trace-Id": "trace-1",
    }

    sanitized = sanitize_headers(headers)

    assert sanitized == {
        "content-type": "application/json",
        "x-trace-id": "trace-1",
    }


def test_decode_payload_supports_json_form_and_raw_inputs():
    json_payload = b'{"type":"checkout.session.completed"}'
    form_payload = b"TransactionToken=tok_1&CompanyRef=tenant_1"
    text_payload = b"plain-text-body"

    assert decode_payload(json_payload, {"content-type": "application/json"}) == {
        "type": "checkout.session.completed"
    }
    assert decode_payload(form_payload, {"content-type": "application/x-www-form-urlencoded"}) == {
        "TransactionToken": "tok_1",
        "CompanyRef": "tenant_1",
    }
    assert decode_payload(text_payload, {"content-type": "text/plain"}) == {"raw": "plain-text-body"}


def test_to_minor_units_uses_decimal_half_up_rounding():
    assert to_minor_units("10.00") == 1000
    assert to_minor_units("10.235") == 1024
    assert to_minor_units(None) is None
    assert to_minor_units("not-a-number") is None


def test_outbox_dedup_key_is_stable_for_equivalent_payloads():
    raw_first = {"event": "checkout.session.completed", "metadata": {"tenant_id": "t1", "plan": "starter"}}
    raw_second = {"metadata": {"plan": "starter", "tenant_id": "t1"}, "event": "checkout.session.completed"}

    first_key = build_outbox_dedup_key(
        provider="stripe",
        event_type="payment.confirmed",
        tenant_id="tenant-1",
        subscription_id="sub-1",
        raw=raw_first,
    )
    second_key = build_outbox_dedup_key(
        provider="stripe",
        event_type="payment.confirmed",
        tenant_id="tenant-1",
        subscription_id="sub-1",
        raw=raw_second,
    )

    assert first_key == second_key
    assert first_key.startswith("stripe:payment.confirmed:tenant-1:sub-1:")


def test_process_event_dispatches_to_event_orchestrator(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_handle_payment_confirmed(**kwargs):
        captured.update(kwargs)
        return MessageResponse(message="processed:delegated")

    monkeypatch.setattr(
        webhook_application_service,
        "handle_payment_confirmed",
        _fake_handle_payment_confirmed,
    )

    response = webhook_application_service.process_event(
        request=object(),
        background_tasks=object(),
        db=object(),
        event_type="payment.confirmed",
        tenant_id="tenant-1",
        subscription_id="sub-1",
        customer_ref="cus-1",
        raw={"k": "v"},
    )

    assert response.message == "processed:delegated"
    assert "background_tasks" not in captured
    assert captured["tenant_id"] == "tenant-1"
    assert captured["subscription_id"] == "sub-1"
    assert captured["customer_ref"] == "cus-1"
    assert captured["raw"] == {"k": "v"}


def test_process_event_returns_ignored_for_unknown_event():
    response = webhook_application_service.process_event(
        request=object(),
        background_tasks=object(),
        db=object(),
        event_type="something.else",
        tenant_id="tenant-1",
        subscription_id="sub-1",
        customer_ref="cus-1",
        raw={},
    )

    assert response.message == "ignored"
