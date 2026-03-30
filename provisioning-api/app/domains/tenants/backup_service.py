"""Compatibility shim for tenant backup helpers.

Runtime ownership moved to ``app.modules.tenant.backup_service``.
"""

from app.modules.tenant.backup_service import *  # noqa: F401,F403
