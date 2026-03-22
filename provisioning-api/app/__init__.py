from app.modules.observability.logging import configure_logging
from app.modules.observability import service as observability  # re-export for tests


configure_logging()

__all__ = ["observability"]
