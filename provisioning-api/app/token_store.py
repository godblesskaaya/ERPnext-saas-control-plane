from __future__ import annotations

import time
from functools import lru_cache
from threading import Lock

from redis import Redis
from redis.exceptions import RedisError

from app.config import get_settings


settings = get_settings()


class InMemoryTokenStore:
    def __init__(self) -> None:
        self._items: dict[str, tuple[str, float]] = {}
        self._lock = Lock()

    def _purge_expired(self, key: str | None = None) -> None:
        now = time.time()
        with self._lock:
            if key is not None:
                item = self._items.get(key)
                if item and item[1] <= now:
                    self._items.pop(key, None)
                return

            expired = [item_key for item_key, (_, expires_at) in self._items.items() if expires_at <= now]
            for item_key in expired:
                self._items.pop(item_key, None)

    def setex(self, name: str, ttl_seconds: int, value: str) -> bool:
        expires_at = time.time() + max(int(ttl_seconds), 1)
        with self._lock:
            self._items[name] = (value, expires_at)
        return True

    def exists(self, name: str) -> int:
        self._purge_expired(name)
        return int(name in self._items)

    def get(self, name: str) -> str | None:
        self._purge_expired(name)
        item = self._items.get(name)
        if not item:
            return None
        return item[0]

    def ping(self) -> bool:
        return True


@lru_cache(maxsize=1)
def get_token_store() -> Redis | InMemoryTokenStore:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        client.ping()
    except RedisError:
        if settings.environment.lower() in {"development", "test"}:
            return InMemoryTokenStore()
        raise
    return client
