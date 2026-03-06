from __future__ import annotations

from fastapi import FastAPI

from app.config import get_settings
from app.db import Base, engine
from app.routers import admin, auth, jobs, tenants


settings = get_settings()

app = FastAPI(title=settings.app_name)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(jobs.router)
app.include_router(admin.router)
