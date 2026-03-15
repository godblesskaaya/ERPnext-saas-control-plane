from app.logging_config import configure_logging
from app.domains import observability  # re-export for tests


configure_logging()

__all__ = ["observability"]
