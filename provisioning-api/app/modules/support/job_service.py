from __future__ import annotations

from sqlalchemy.orm import Session, object_session

from app.models import Job
from app.modules.support.job_stream import publish_job_done, publish_job_log
from app.utils.time import utcnow, utcnow_iso


def append_log(job: Job, message: str) -> None:
    line = f"[{utcnow_iso()}] {message}"
    job.logs = f"{job.logs}\\n{line}".strip()
    db_session = object_session(job)
    if db_session is not None:
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
    publish_job_log(job.id, line)


def mark_job_running(db: Session, job: Job) -> None:
    job.status = "running"
    job.started_at = utcnow()
    db.add(job)
    db.commit()
    db.refresh(job)


def mark_job_success(db: Session, job: Job) -> None:
    job.status = "succeeded"
    job.finished_at = utcnow()
    db.add(job)
    db.commit()
    db.refresh(job)
    publish_job_done(job.id)


def mark_job_failed(db: Session, job: Job, error: str) -> None:
    job.status = "failed"
    job.error = error
    job.finished_at = utcnow()
    db.add(job)
    db.commit()
    db.refresh(job)
    publish_job_log(job.id, f"[{utcnow_iso()}] ERROR: {error}")
    publish_job_done(job.id)
