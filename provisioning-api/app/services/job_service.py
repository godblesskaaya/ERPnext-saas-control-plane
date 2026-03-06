from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Job


def append_log(job: Job, message: str) -> None:
    line = f"[{datetime.utcnow().isoformat()}] {message}"
    job.logs = f"{job.logs}\\n{line}".strip()


def mark_job_running(db: Session, job: Job) -> None:
    job.status = "running"
    job.started_at = datetime.utcnow()
    db.add(job)
    db.commit()
    db.refresh(job)


def mark_job_success(db: Session, job: Job) -> None:
    job.status = "succeeded"
    job.finished_at = datetime.utcnow()
    db.add(job)
    db.commit()
    db.refresh(job)


def mark_job_failed(db: Session, job: Job, error: str) -> None:
    job.status = "failed"
    job.error = error
    job.finished_at = datetime.utcnow()
    db.add(job)
    db.commit()
    db.refresh(job)
