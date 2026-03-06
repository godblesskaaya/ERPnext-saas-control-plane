from __future__ import annotations

import subprocess
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import Redis
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
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


@app.on_event("startup")
def startup() -> None:
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
