from __future__ import annotations

import app.worker as worker


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, bytes] = {}
        self.expiry: dict[str, int] = {}

    def set(self, key: str, value: str, nx: bool = False, ex: int | None = None):
        if nx and key in self.store:
            return False
        self.store[key] = value.encode("utf-8")
        if ex is not None:
            self.expiry[key] = ex
        return True

    def get(self, key: str):
        return self.store.get(key)

    def expire(self, key: str, seconds: int):
        if key in self.store:
            self.expiry[key] = seconds
            return True
        return False


class FakeQueue:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def enqueue(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return object()


def test_acquire_or_renew_lock_supports_owner_takeover_rules(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(worker.settings, "billing_dunning_auto_lock_seconds", 90, raising=False)

    assert worker._acquire_or_renew_lock(redis, "owner-a") is True
    assert worker._acquire_or_renew_lock(redis, "owner-b") is False
    assert worker._acquire_or_renew_lock(redis, "owner-a") is True
    assert redis.expiry[worker._DUNNING_LOCK_KEY] == 90


def test_enqueue_dunning_cycle_if_due_respects_interval(monkeypatch):
    redis = FakeRedis()
    queue = FakeQueue()
    now = {"value": 1_000.0}

    monkeypatch.setattr(worker.settings, "billing_dunning_auto_enabled", True, raising=False)
    monkeypatch.setattr(worker.settings, "billing_dunning_auto_interval_minutes", 1, raising=False)
    monkeypatch.setattr(worker, "get_queue", lambda: queue)
    monkeypatch.setattr(worker.time, "time", lambda: now["value"])

    worker._enqueue_dunning_cycle_if_due(redis)
    assert len(queue.calls) == 1

    worker._enqueue_dunning_cycle_if_due(redis)
    assert len(queue.calls) == 1

    now["value"] = 1_061.0
    worker._enqueue_dunning_cycle_if_due(redis)
    assert len(queue.calls) == 2
