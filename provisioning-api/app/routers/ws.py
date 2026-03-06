from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketState

from app.db import SessionLocal
from app.models import Job, Tenant, User
from app.queue.redis import get_redis_connection
from app.security import decode_access_token


router = APIRouter(tags=["ws"])


@router.websocket("/ws/jobs/{job_id}")
async def job_stream(websocket: WebSocket, job_id: str, token: str):
    await websocket.accept()
    db = SessionLocal()
    pubsub = None
    try:
        try:
            payload = decode_access_token(token)
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

        if user.role != "admin" and tenant.owner_id != user.id:
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
