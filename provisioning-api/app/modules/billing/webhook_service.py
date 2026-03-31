"""Application-layer billing webhook orchestration.

Transport endpoints in ``router.py`` should remain thin wrappers that pass the
raw request data into this module. This layer owns payload normalization,
provider-path validation, event processing orchestration, and payment-event
logging semantics.
"""

from __future__ import annotations

from fastapi import BackgroundTasks, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.modules.billing.webhook_application_service import (
    ensure_outbox_event,
    process_event,
    record_payment_event,
)
from app.modules.billing.webhook_normalization import (
    build_outbox_dedup_key,
    decode_payload,
    resolve_processing_status,
    sanitize_headers,
    to_minor_units,
)
from app.schemas import MessageResponse
from app.utils.time import utcnow


BAD_REQUEST_400_RESPONSE = {"description": "Bad request: provider mismatch or invalid provider route."}
INTERNAL_500_RESPONSE = {"description": "Internal processing error while parsing or handling webhook event."}


def handle_gateway_webhook(
    *,
    route_provider: str | None,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session,
    payload: bytes,
    request_headers: dict[str, str],
    gateway,
) -> MessageResponse:
    """Parse, process, and persist webhook outcomes for default/provider routes."""
    normalized_provider = route_provider.strip().lower() if route_provider is not None else None
    decoded_payload = decode_payload(payload, request_headers)

    if normalized_provider is not None and normalized_provider != gateway.provider_name:
        message = f"This instance is configured for provider '{gateway.provider_name}'"
        record_payment_event(
            db=db,
            provider=normalized_provider,
            event_type="provider_mismatch",
            processing_status="rejected",
            http_status=status.HTTP_400_BAD_REQUEST,
            message=message,
            tenant_id=None,
            subscription_id=None,
            customer_ref=None,
            request_headers=request_headers,
            payload=decoded_payload,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    provider_for_logs = normalized_provider or gateway.provider_name

    try:
        event = gateway.parse_webhook(payload, dict(request.headers))
    except ValueError as exc:
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type="parse_error",
            processing_status="error",
            http_status=status.HTTP_400_BAD_REQUEST,
            message=str(exc),
            tenant_id=None,
            subscription_id=None,
            customer_ref=None,
            request_headers=request_headers,
            payload=decoded_payload,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    outbox_event = ensure_outbox_event(
        db=db,
        provider=provider_for_logs,
        event_type=event.event_type,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        raw=event.raw,
    )
    if outbox_event.status == "processed":
        response = MessageResponse(
            message="ignored:duplicate"
            if event.event_type == "ignored"
            else f"processed:{event.event_type}"
        )
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type=event.event_type,
            processing_status=resolve_processing_status(response.message),
            http_status=status.HTTP_200_OK,
            message=response.message,
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            request_headers=request_headers,
            payload=event.raw,
        )
        return response

    outbox_event.status = "processing"
    outbox_event.attempts += 1
    outbox_event.last_error = None
    db.add(outbox_event)
    db.commit()

    try:
        response = process_event(
            request=request,
            background_tasks=background_tasks,
            db=db,
            event_type=event.event_type,
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            raw=event.raw,
        )
    except HTTPException as exc:
        db.rollback()
        outbox_event.status = "failed"
        outbox_event.last_error = str(exc.detail)
        db.add(outbox_event)
        db.commit()
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type=event.event_type,
            processing_status="error",
            http_status=exc.status_code,
            message=str(exc.detail),
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            request_headers=request_headers,
            payload=event.raw,
        )
        raise
    except Exception as exc:
        db.rollback()
        outbox_event.status = "failed"
        outbox_event.last_error = str(exc)
        db.add(outbox_event)
        db.commit()
        record_payment_event(
            db=db,
            provider=provider_for_logs,
            event_type=event.event_type,
            processing_status="error",
            http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=str(exc),
            tenant_id=event.tenant_id,
            subscription_id=event.subscription_id,
            customer_ref=event.customer_ref,
            request_headers=request_headers,
            payload=event.raw,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    outbox_event.status = "processed"
    outbox_event.last_error = None
    outbox_event.processed_at = utcnow()
    db.add(outbox_event)
    db.commit()

    record_payment_event(
        db=db,
        provider=provider_for_logs,
        event_type=event.event_type,
        processing_status=resolve_processing_status(response.message),
        http_status=status.HTTP_200_OK,
        message=response.message,
        tenant_id=event.tenant_id,
        subscription_id=event.subscription_id,
        customer_ref=event.customer_ref,
        request_headers=request_headers,
        payload=event.raw,
    )
    return response
