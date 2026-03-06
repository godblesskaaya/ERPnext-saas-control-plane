from __future__ import annotations

from rq import Queue

from app.queue.redis import get_redis_connection


def get_queue(name: str = "provisioning") -> Queue:
    return Queue(name=name, connection=get_redis_connection())
