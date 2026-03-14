from __future__ import annotations

from app.queue.redis import get_redis_connection


def publish_job_log(job_id: str, message: str) -> None:
    try:
        get_redis_connection().publish(f"job:{job_id}:logs", message)
    except Exception:
        return


def publish_job_done(job_id: str) -> None:
    publish_job_log(job_id, "__DONE__")
