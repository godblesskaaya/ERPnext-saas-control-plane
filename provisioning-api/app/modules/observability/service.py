from __future__ import annotations

from importlib import import_module
import sys

from app.config import get_settings

_sentry_initialized = False


def _compat_module():
    # AGENT-NOTE: Phase 1 keeps app.domains.observability as a shim. Tests patch
    # private/module attributes on the legacy module, so state/import hooks must
    # resolve through that module when available.
    legacy = sys.modules.get("app.domains.observability")
    if legacy is not None and legacy is not sys.modules[__name__]:
        return legacy
    return sys.modules[__name__]


def init_sentry(*, include_fastapi: bool = True, include_rq: bool = True) -> bool:
    """Initialize Sentry when a DSN is configured."""
    global _sentry_initialized

    module = _compat_module()

    if getattr(module, "_sentry_initialized", _sentry_initialized):
        return True

    settings = get_settings()
    dsn = settings.sentry_dsn.strip()
    if not dsn:
        return False

    importer = getattr(module, "import_module", import_module)

    try:
        sentry_sdk = importer("sentry_sdk")
        fastapi_module = importer("sentry_sdk.integrations.fastapi")
        rq_module = importer("sentry_sdk.integrations.rq")
    except ModuleNotFoundError:
        return False

    integrations = []
    if include_fastapi:
        integrations.append(fastapi_module.FastApiIntegration())
    if include_rq:
        integrations.append(rq_module.RqIntegration())

    sentry_sdk.init(
        dsn=dsn,
        integrations=integrations,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )
    _sentry_initialized = True
    setattr(module, "_sentry_initialized", True)
    return True


def init_metrics(app, *, enabled: bool = True) -> bool:
    if not enabled:
        return False

    module = _compat_module()
    importer = getattr(module, "import_module", import_module)

    try:
        instrumentator_module = importer("prometheus_fastapi_instrumentator")
    except ModuleNotFoundError:
        return False

    instrumentator = instrumentator_module.Instrumentator()
    instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    return True
