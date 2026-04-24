from __future__ import annotations

import os
import threading
import time
from datetime import timedelta
from uuid import uuid4

import sentry_sdk

from rq import Worker

from app.config import get_settings
from app.db import SessionLocal
from app.models import Job
from app.modules.observability import init_sentry
from app.modules.observability.logging import get_logger
from app.modules.support.job_service import append_log, mark_job_failed
from app.queue.enqueue import get_queue
from app.queue.redis import get_redis_connection
from app.utils.time import utcnow
from app.workers.dlq import on_job_failure

settings = get_settings()
log = get_logger(__name__)

_DUNNING_LOCK_KEY = "scheduler:billing_dunning:leader"
_DUNNING_LAST_ENQUEUE_KEY = "scheduler:billing_dunning:last_enqueue_ts"
_TRIAL_LOCK_KEY = "scheduler:trial_lifecycle:leader"
_TRIAL_LAST_ENQUEUE_KEY = "scheduler:trial_lifecycle:last_enqueue_ts"
_RECONCILIATION_LOCK_KEY = "scheduler:billing_reconciliation:leader"
_RECONCILIATION_LAST_ENQUEUE_KEY = "scheduler:billing_reconciliation:last_enqueue_ts"


def _capture_scheduler_death(scheduler_name: str, owner_id: str) -> None:
    thread_name = threading.current_thread().name
    log.critical(
        f"billing.{scheduler_name}.thread_died",
        owner_id=owner_id,
        thread_name=thread_name,
    )
    sentry_sdk.capture_message(f"Scheduler thread died: {thread_name}", level="fatal")


def _recover_stuck_jobs() -> None:
    db = SessionLocal()
    try:
        cutoff = utcnow() - timedelta(minutes=30)
        stuck_jobs = (
            db.query(Job)
            .filter(
                Job.status == "running",
                Job.updated_at < cutoff,
            )
            .all()
        )
        for job in stuck_jobs:
            append_log(job, "recovered: job marked failed after worker restart")
            mark_job_failed(db, job, "recovered_after_worker_restart")
            log.warning("worker.stuck_job_recovered", job_id=job.id)
        if stuck_jobs:
            db.commit()
    except Exception:
        db.rollback()
        log.exception("worker.stuck_job_recovery_failed")
        raise
    finally:
        db.close()


def _lock_seconds_for_key(lock_key: str) -> int:
    if lock_key == _TRIAL_LOCK_KEY:
        return max(settings.trial_scheduler_auto_lock_seconds, 30)
    if lock_key == _RECONCILIATION_LOCK_KEY:
        return max(settings.billing_reconciliation_auto_lock_seconds, 30)
    return max(settings.billing_dunning_auto_lock_seconds, 30)


def _acquire_or_renew_lock(connection, owner_id: str, *, lock_key: str = _DUNNING_LOCK_KEY) -> bool:
    lock_seconds = _lock_seconds_for_key(lock_key)

    if connection.set(lock_key, owner_id, nx=True, ex=lock_seconds):
        return True

    current = connection.get(lock_key)
    if current and current.decode("utf-8") == owner_id:
        connection.expire(lock_key, lock_seconds)
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


def _enqueue_trial_cycle_if_due(connection) -> None:
    if not settings.trial_lifecycle_enabled or not settings.trial_scheduler_auto_enabled:
        return

    interval_seconds = max(settings.trial_scheduler_auto_interval_minutes, 1) * 60
    now = time.time()
    last_raw = connection.get(_TRIAL_LAST_ENQUEUE_KEY)
    last_ts = float(last_raw.decode("utf-8")) if last_raw else 0.0

    if now - last_ts < interval_seconds:
        return

    get_queue().enqueue(
        "app.workers.tasks.run_trial_lifecycle_cycle",
        None,
        False,
        job_timeout="10m",
    )
    connection.set(
        _TRIAL_LAST_ENQUEUE_KEY,
        str(now),
        ex=max(interval_seconds * 8, 60 * 60),
    )
    log.info(
        "billing.trial_scheduler.enqueued",
        interval_minutes=settings.trial_scheduler_auto_interval_minutes,
    )


def _enqueue_reconciliation_cycle_if_due(connection) -> None:
    if not settings.billing_reconciliation_auto_enabled:
        return

    interval_seconds = max(settings.billing_reconciliation_auto_interval_minutes, 1) * 60
    now = time.time()
    last_raw = connection.get(_RECONCILIATION_LAST_ENQUEUE_KEY)
    last_ts = float(last_raw.decode("utf-8")) if last_raw else 0.0

    if now - last_ts < interval_seconds:
        return

    get_queue().enqueue(
        "app.workers.tasks.run_billing_reconciliation_cycle",
        None,
        job_timeout="10m",
    )
    connection.set(
        _RECONCILIATION_LAST_ENQUEUE_KEY,
        str(now),
        ex=max(interval_seconds * 8, 60 * 60),
    )
    log.info(
        "billing.reconciliation_scheduler.enqueued",
        interval_minutes=settings.billing_reconciliation_auto_interval_minutes,
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
        try:
            if startup_delay:
                time.sleep(startup_delay)
            while True:
                try:
                    if _acquire_or_renew_lock(connection, owner_id):
                        _enqueue_dunning_cycle_if_due(connection)
                except Exception:
                    log.exception("billing.dunning_scheduler.error")
                time.sleep(poll_seconds)
        finally:
            _capture_scheduler_death("dunning_scheduler", owner_id)

    thread = threading.Thread(target=_loop, name="billing-dunning-scheduler", daemon=True)
    thread.start()
    log.info(
        "billing.dunning_scheduler.started",
        interval_minutes=settings.billing_dunning_auto_interval_minutes,
        poll_seconds=poll_seconds,
    )


def _start_trial_scheduler(connection) -> None:
    if not settings.trial_lifecycle_enabled or not settings.trial_scheduler_auto_enabled:
        log.info("billing.trial_scheduler.disabled")
        return

    owner_id = f"{os.uname().nodename}:{os.getpid()}:{uuid4().hex[:8]}"
    interval_seconds = max(settings.trial_scheduler_auto_interval_minutes, 1) * 60
    poll_seconds = max(10, min(60, interval_seconds // 3))

    def _loop() -> None:
        startup_delay = max(settings.trial_scheduler_auto_startup_delay_seconds, 0)
        try:
            if startup_delay:
                time.sleep(startup_delay)
            while True:
                try:
                    if _acquire_or_renew_lock(connection, owner_id, lock_key=_TRIAL_LOCK_KEY):
                        _enqueue_trial_cycle_if_due(connection)
                except Exception:
                    log.exception("billing.trial_scheduler.error")
                time.sleep(poll_seconds)
        finally:
            _capture_scheduler_death("trial_scheduler", owner_id)

    thread = threading.Thread(target=_loop, name="billing-trial-scheduler", daemon=True)
    thread.start()
    log.info(
        "billing.trial_scheduler.started",
        interval_minutes=settings.trial_scheduler_auto_interval_minutes,
        poll_seconds=poll_seconds,
    )


def _start_reconciliation_scheduler(connection) -> None:
    if not settings.billing_reconciliation_auto_enabled:
        log.info("billing.reconciliation_scheduler.disabled")
        return

    owner_id = f"{os.uname().nodename}:{os.getpid()}:{uuid4().hex[:8]}"
    interval_seconds = max(settings.billing_reconciliation_auto_interval_minutes, 1) * 60
    poll_seconds = max(10, min(60, interval_seconds // 3))

    def _loop() -> None:
        startup_delay = max(settings.billing_reconciliation_auto_startup_delay_seconds, 0)
        try:
            if startup_delay:
                time.sleep(startup_delay)
            while True:
                try:
                    if _acquire_or_renew_lock(connection, owner_id, lock_key=_RECONCILIATION_LOCK_KEY):
                        _enqueue_reconciliation_cycle_if_due(connection)
                except Exception:
                    log.exception("billing.reconciliation_scheduler.error")
                time.sleep(poll_seconds)
        finally:
            _capture_scheduler_death("reconciliation_scheduler", owner_id)

    thread = threading.Thread(target=_loop, name="billing-reconciliation-scheduler", daemon=True)
    thread.start()
    log.info(
        "billing.reconciliation_scheduler.started",
        interval_minutes=settings.billing_reconciliation_auto_interval_minutes,
        poll_seconds=poll_seconds,
    )


if __name__ == "__main__":
    init_sentry(include_fastapi=False, include_rq=True)
    connection = get_redis_connection()
    _recover_stuck_jobs()
    _start_dunning_scheduler(connection)
    _start_trial_scheduler(connection)
    _start_reconciliation_scheduler(connection)
    worker = Worker(["provisioning"], connection=connection, exception_handlers=[on_job_failure])
    worker.work()
