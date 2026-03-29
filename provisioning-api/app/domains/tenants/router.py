"""Compatibility shim for tenant router symbols.

This module re-exports ``app.modules.tenant.router`` by aliasing the module
object so legacy imports keep working and remain patchable.
"""

from importlib import import_module
import sys

sys.modules[__name__] = import_module("app.modules.tenant.router")
