from __future__ import annotations

import os
import threading
import time
from uuid import uuid4

from rq import Worker

from app.config import get_settings
from app.domains.observability import init_sentry
from app.logging_config import get_logger
from app.queue.enqueue import get_queue
from app.queue.redis import get_redis_connection
from app.workers.dlq import on_job_failure

settings = get_settings()
log = get_logger(__name__)

_DUNNING_LOCK_KEY = "scheduler:billing_dunning:leader"
_DUNNING_LAST_ENQUEUE_KEY = "scheduler:billing_dunning:last_enqueue_ts"


def _acquire_or_renew_lock(connection, owner_id: str) -> bool:
    lock_seconds = max(settings.billing_dunning_auto_lock_seconds, 30)
    if connection.set(_DUNNING_LOCK_KEY, owner_id, nx=True, ex=lock_seconds):
        return True

    current = connection.get(_DUNNING_LOCK_KEY)
    if current and current.decode("utf-8") == owner_id:
        connection.expire(_DUNNING_LOCK_KEY, lock_seconds)
        return True
    return False


def _enqueue_dunning_cycle_if_due(connection) -> None:
    if not settings.billing_dunning_auto_enabled:
        return

    interval_seconds = max(settings.billing_dunning_auto_interval_minutes, 1) * 60
    now = time.time()
    last_raw = connection.get(_DUNNING_LAST_ENQUEUE_KEY)
    last_ts = float(last_raw.decode("utf-8")) if last_raw else 0.0

    if now - last_ts < interval_seconds:
        return

    get_queue().enqueue(
        "app.workers.tasks.run_billing_dunning_cycle",
        None,
        False,
        job_timeout="10m",
    )
    connection.set(
        _DUNNING_LAST_ENQUEUE_KEY,
        str(now),
        ex=max(interval_seconds * 8, 60 * 60),
    )
    log.info(
        "billing.dunning_scheduler.enqueued",
        interval_minutes=settings.billing_dunning_auto_interval_minutes,
    )


def _start_dunning_scheduler(connection) -> None:
    if not settings.billing_dunning_auto_enabled:
        log.info("billing.dunning_scheduler.disabled")
        return

    owner_id = f"{os.uname().nodename}:{os.getpid()}:{uuid4().hex[:8]}"
    interval_seconds = max(settings.billing_dunning_auto_interval_minutes, 1) * 60
    poll_seconds = max(10, min(60, interval_seconds // 3))

    def _loop() -> None:
        startup_delay = max(settings.billing_dunning_auto_startup_delay_seconds, 0)
        if startup_delay:
            time.sleep(startup_delay)
        while True:
            try:
                if _acquire_or_renew_lock(connection, owner_id):
                    _enqueue_dunning_cycle_if_due(connection)
            except Exception:
                log.exception("billing.dunning_scheduler.error")
            time.sleep(poll_seconds)

    thread = threading.Thread(target=_loop, name="billing-dunning-scheduler", daemon=True)
    thread.start()
    log.info(
        "billing.dunning_scheduler.started",
        interval_minutes=settings.billing_dunning_auto_interval_minutes,
        poll_seconds=poll_seconds,
    )


if __name__ == "__main__":
    init_sentry(include_fastapi=False, include_rq=True)
    connection = get_redis_connection()
    _start_dunning_scheduler(connection)
    worker = Worker(["provisioning"], connection=connection, exception_handlers=[on_job_failure])
    worker.work()
