from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket
from starlette.websockets import WebSocketState

from app.config import get_settings
from app.db import SessionLocal
from app.models import Job, Tenant, User
from app.queue.redis import get_redis_connection
from app.domains.tenants.membership import ensure_membership
from app.modules.identity.security import decode_access_token


router = APIRouter(tags=["ws"])


def _extract_token_from_subprotocol(header_value: str | None) -> tuple[str | None, str | None]:
    if not header_value:
        return None, None
    for raw in header_value.split(","):
        protocol = raw.strip()
        if protocol.startswith("bearer."):
            token = protocol.removeprefix("bearer.").strip()
            if token:
                return token, protocol
    return None, None


@router.websocket("/ws/jobs/{job_id}")
async def job_stream(websocket: WebSocket, job_id: str, token: str | None = None):
    settings = get_settings()
    subprotocol_token, selected_subprotocol = _extract_token_from_subprotocol(
        websocket.headers.get("sec-websocket-protocol")
    )
    await websocket.accept(subprotocol=selected_subprotocol)
    db = SessionLocal()
    pubsub = None
    try:
        access_token = subprotocol_token or token
        if settings.is_production and token and not subprotocol_token:
            await websocket.close(code=4401)
            return
        if not access_token:
            await websocket.close(code=4401)
            return

        try:
            payload = decode_access_token(access_token)
        except Exception:
            await websocket.close(code=4401)
            return

        user = db.get(User, payload.get("sub"))
        if not user:
            await websocket.close(code=4401)
            return

        job = db.get(Job, job_id)
        if not job:
            await websocket.close(code=4404)
            return

        tenant = db.get(Tenant, job.tenant_id)
        if not tenant:
            await websocket.close(code=4404)
            return

        try:
            ensure_membership(db, tenant=tenant, user=user)
        except HTTPException:
            await websocket.close(code=4403)
            return

        pubsub = get_redis_connection().pubsub()
        channel = f"job:{job_id}:logs"
        pubsub.subscribe(channel)

        while True:
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data = message.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                text = str(data)
                await websocket.send_text(text)
                if text == "__DONE__":
                    break
            await asyncio.sleep(0.1)
    finally:
        if pubsub is not None:
            try:
                pubsub.unsubscribe()
                pubsub.close()
            except Exception:
                pass
        db.close()
        try:
            if websocket.application_state != WebSocketState.DISCONNECTED:
                await websocket.close()
        except RuntimeError:
            pass
