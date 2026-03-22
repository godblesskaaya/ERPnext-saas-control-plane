"""Compatibility shim for billing domain imports."""

from app.modules.billing.router import router

__all__ = ["router"]
