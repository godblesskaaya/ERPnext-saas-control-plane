#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class LimitResult:
    endpoint: str
    method: str
    attempts: int
    blocked: int
    first_block_at: int | None
    status_counts: dict[str, int]
    error_samples: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rate limit baseline probe (stdlib only).")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="API host")
    parser.add_argument("--api-prefix", default="", help="Optional API prefix")
    parser.add_argument("--attempts", type=int, default=20, help="Requests per endpoint")
    parser.add_argument("--timeout", type=float, default=10.0, help="Request timeout seconds")
    parser.add_argument("--artifact", default="", help="Optional JSON artifact output path")
    return parser.parse_args()


def build_url(base_url: str, api_prefix: str, path: str) -> str:
    base = base_url.rstrip("/")
    prefix = f"/{api_prefix.strip('/')}" if api_prefix.strip("/") else ""
    return f"{base}{prefix}{path}"


def _json_bytes(payload: dict[str, Any] | None) -> bytes | None:
    if payload is None:
        return None
    return json.dumps(payload).encode("utf-8")


def send_request(url: str, method: str, timeout: float, payload: dict[str, Any] | None = None) -> tuple[int, str | None]:
    request = Request(url=url, data=_json_bytes(payload), method=method)
    request.add_header("Content-Type", "application/json")
    try:
        with urlopen(request, timeout=timeout) as response:
            _ = response.read()
            return int(response.status), None
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return int(exc.code), detail[:280]
    except URLError as exc:
        return 0, str(exc.reason)
    except Exception as exc:  # pragma: no cover
        return 0, str(exc)


def run_limit_probe(
    *,
    endpoint: str,
    method: str,
    payload: dict[str, Any] | None,
    attempts: int,
    timeout: float,
) -> LimitResult:
    blocked = 0
    status_counts: dict[str, int] = {}
    error_samples: list[str] = []
    first_block_at: int | None = None

    for i in range(1, attempts + 1):
        status, error = send_request(endpoint, method, timeout, payload)
        status_key = str(status)
        status_counts[status_key] = status_counts.get(status_key, 0) + 1
        if status == 429:
            blocked += 1
            if first_block_at is None:
                first_block_at = i
        if error and len(error_samples) < 5:
            error_samples.append(error)
        time.sleep(0.1)

    return LimitResult(
        endpoint=endpoint,
        method=method,
        attempts=attempts,
        blocked=blocked,
        first_block_at=first_block_at,
        status_counts=status_counts,
        error_samples=error_samples,
    )


def main() -> int:
    args = parse_args()
    email = f"rate-{uuid.uuid4().hex[:10]}@example.com"

    signup_payload = {"email": email, "password": "RateLimit123!"}
    login_payload = {"email": email, "password": "RateLimit123!"}

    endpoints = [
        ("signup", "POST", build_url(args.base_url, args.api_prefix, "/auth/signup"), signup_payload),
        ("login", "POST", build_url(args.base_url, args.api_prefix, "/auth/login"), login_payload),
    ]

    results: list[dict[str, Any]] = []
    for name, method, url, payload in endpoints:
        print(f"Probing {name} rate limit...")
        result = run_limit_probe(endpoint=url, method=method, payload=payload, attempts=args.attempts, timeout=args.timeout)
        results.append({
            "name": name,
            "endpoint": result.endpoint,
            "method": result.method,
            "attempts": result.attempts,
            "blocked": result.blocked,
            "first_block_at": result.first_block_at,
            "status_counts": result.status_counts,
            "error_samples": result.error_samples,
        })

    summary = {
        "generated_at_epoch": int(time.time()),
        "base_url": args.base_url,
        "api_prefix": args.api_prefix,
        "attempts": args.attempts,
        "results": results,
    }

    print(json.dumps(summary, indent=2))

    if args.artifact:
        artifact_path = Path(args.artifact)
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"Artifact written: {artifact_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
