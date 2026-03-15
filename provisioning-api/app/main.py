from __future__ import annotations

import subprocess
from pathlib import Path

from contextlib import asynccontextmanager

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
from app.domains.billing import router as billing_router
from app.domains.iam import router as auth_router
from app.domains.observability import init_metrics, init_sentry
from app.domains.support import admin_router, jobs_router, ws_router
from app.domains.tenants import router as tenants_router
from app.queue.redis import get_redis_connection
from app.rate_limits import limiter


settings = get_settings()
init_sentry(include_fastapi=True, include_rq=True)
APP_ROOT = Path(__file__).resolve().parents[1]
API_PREFIX = f"/{settings.api_prefix.strip('/')}" if settings.api_prefix.strip("/") else ""


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

        tenant_columns = {column["name"] for column in inspector.get_columns("tenants")} if "tenants" in tables else set()
        users_columns = {column["name"] for column in inspector.get_columns("users")} if "users" in tables else set()
        if {"email_verified", "email_verified_at"}.issubset(users_columns):
            if "tenant_memberships" in tables and "organizations" in tables and "organization_id" in tenant_columns:
                if "domain_mappings" in tables and "support_notes" in tables:
                    return "20260315_0009"
                return "20260315_0008"
            return "20260308_0007"

        if {"payment_provider", "dpo_transaction_token"}.issubset(tenant_columns):
            return "20260307_0006"

        if "chosen_app" in tenant_columns:
            return "20260307_0005"

        if "backups" in tables:
            return "20260306_0004"

        has_audit = "audit_logs" in tables
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


def _run_startup_migrations() -> None:
    legacy_revision = _detect_legacy_schema_revision(settings.database_url)
    if legacy_revision:
        subprocess.run(["alembic", "stamp", legacy_revision], cwd=APP_ROOT, check=True)
    subprocess.run(["alembic", "upgrade", "head"], cwd=APP_ROOT, check=True)


def startup() -> None:
    _run_startup_migrations()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _run_startup_migrations()
    yield


app = FastAPI(
    title=settings.app_name,
    docs_url="/docs" if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.openapi_schema_enabled else None,
    redoc_url=None,
    lifespan=lifespan,
)
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
init_metrics(app, enabled=settings.metrics_enabled)


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


app.add_api_route(f"{API_PREFIX}/health", health, methods=["GET"])


app.include_router(auth_router.router, prefix=API_PREFIX)
app.include_router(tenants_router.router, prefix=API_PREFIX)
app.include_router(jobs_router.router, prefix=API_PREFIX)
app.include_router(admin_router.router, prefix=API_PREFIX)
app.include_router(billing_router.router, prefix=API_PREFIX)
app.include_router(ws_router.router, prefix=API_PREFIX)
