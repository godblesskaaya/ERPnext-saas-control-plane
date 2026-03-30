"""Compatibility shim for tenant membership helpers.

Runtime ownership moved to ``app.modules.tenant.membership``.
"""

from app.modules.tenant.membership import *  # noqa: F401,F403
