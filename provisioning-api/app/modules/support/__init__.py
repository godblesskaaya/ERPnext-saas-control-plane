"""Support module package (transitional wrappers over legacy support domain)."""

from app.modules.support.admin_router import router as admin_router
from app.modules.support.jobs_router import router as jobs_router
from app.modules.support.ws_router import router as ws_router

__all__ = ["admin_router", "jobs_router", "ws_router"]
