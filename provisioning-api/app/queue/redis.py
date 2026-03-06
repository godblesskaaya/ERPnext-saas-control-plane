from __future__ import annotations

from redis import Redis

from app.config import get_settings


settings = get_settings()


def get_redis_connection() -> Redis:
    return Redis.from_url(settings.redis_url)
