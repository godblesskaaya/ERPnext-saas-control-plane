from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import Redis
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import create_engine, inspect
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.middleware.security import SecurityHeadersMiddleware
from app.observability import init_metrics, init_sentry
from app.queue.redis import get_redis_connection
from app.rate_limits import limiter
from app.routers import admin, auth, billing, jobs, tenants, ws


settings = get_settings()
init_sentry(include_fastapi=True, include_rq=True)

app = FastAPI(title=settings.app_name)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.saas_ui_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
APP_ROOT = Path(__file__).resolve().parents[1]
init_metrics(app)


def _detect_legacy_schema_revision(database_url: str) -> str | None:
    """
    Detect pre-Alembic schemas and map them to the correct baseline revision for stamping.
    Returns None when no legacy stamp is needed.
    """
    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        if "alembic_version" in tables:
            return None

        # Fresh DB: allow normal upgrade path from base migration.
        core_tables = {"users", "tenants", "jobs"}
        if not core_tables.issubset(tables):
            return None

        if "backups" in tables:
            return "20260306_0004"

        has_audit = "audit_logs" in tables
        users_columns = {column["name"] for column in inspector.get_columns("users")}
        tenant_columns = {column["name"] for column in inspector.get_columns("tenants")}
        has_billing = {
            "billing_status",
            "stripe_checkout_session_id",
            "stripe_subscription_id",
        }.issubset(tenant_columns) and "stripe_customer_id" in users_columns

        if has_audit and has_billing:
            return "20260306_0003"
        if has_audit:
            return "20260306_0002"
        return "20260306_0001"
    finally:
        engine.dispose()


@app.on_event("startup")
def startup() -> None:
    legacy_revision = _detect_legacy_schema_revision(settings.database_url)
    if legacy_revision:
        subprocess.run(["alembic", "stamp", legacy_revision], cwd=APP_ROOT, check=True)
    subprocess.run(["alembic", "upgrade", "head"], cwd=APP_ROOT, check=True)


@app.get("/health")
def health(db: Session = Depends(get_db), redis: Redis = Depends(get_redis_connection)) -> JSONResponse:
    checks: dict[str, str] = {}
    status = "ok"
    status_code = 200

    try:
        db.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc.__class__.__name__}"
        status = "degraded"
        status_code = 503

    try:
        redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc.__class__.__name__}"
        status = "degraded"
        status_code = 503

    return JSONResponse(
        status_code=status_code,
        content={"status": status, "service": settings.app_name, "checks": checks},
    )


app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(jobs.router)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(ws.router)
