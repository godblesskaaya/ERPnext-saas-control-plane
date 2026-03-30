"""Compatibility shim for tenant TLS sync helpers.

Runtime ownership moved to ``app.modules.tenant.tls_sync``.
"""

from app.modules.tenant.tls_sync import *  # noqa: F401,F403
