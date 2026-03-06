from __future__ import annotations

from typing import Any

from rq import Queue

from app.queue.redis import get_redis_connection


def get_dead_letter_queue(connection=None) -> Queue:
    return Queue("dead-letter", connection=connection or get_redis_connection())


def handle_failed_job(
    original_job_id: str,
    func_name: str,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "original_job_id": original_job_id,
        "func_name": func_name,
        "args": list(args),
        "kwargs": kwargs,
        "error": error or "",
    }


def on_job_failure(job, connection, exc_type, exc_value, _traceback) -> bool:
    dlq = get_dead_letter_queue(connection=connection)
    dlq.enqueue(
        "app.workers.dlq.handle_failed_job",
        job.id,
        job.func_name,
        tuple(job.args or ()),
        dict(job.kwargs or {}),
        str(exc_value) if exc_value else "",
    )
    return False
