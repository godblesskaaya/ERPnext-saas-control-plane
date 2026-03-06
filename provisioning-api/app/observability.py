from __future__ import annotations

from importlib import import_module

from app.config import get_settings

_sentry_initialized = False


def init_sentry(*, include_fastapi: bool = True, include_rq: bool = True) -> bool:
    """Initialize Sentry when a DSN is configured."""
    global _sentry_initialized

    if _sentry_initialized:
        return True

    settings = get_settings()
    dsn = settings.sentry_dsn.strip()
    if not dsn:
        return False

    try:
        sentry_sdk = import_module("sentry_sdk")
        fastapi_module = import_module("sentry_sdk.integrations.fastapi")
        rq_module = import_module("sentry_sdk.integrations.rq")
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
    return True


def init_metrics(app) -> bool:
    try:
        instrumentator_module = import_module("prometheus_fastapi_instrumentator")
    except ModuleNotFoundError:
        return False

    instrumentator = instrumentator_module.Instrumentator()
    instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    return True
