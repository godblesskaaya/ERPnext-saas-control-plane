"""Compatibility shim for moved implementation."""

from importlib import import_module as _import_module

_module = _import_module("app.modules.support.job_stream")
__all__ = getattr(_module, "__all__", [name for name in vars(_module) if not name.startswith("_")])
globals().update({name: getattr(_module, name) for name in __all__})
