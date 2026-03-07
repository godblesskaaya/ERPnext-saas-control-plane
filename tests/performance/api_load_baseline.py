#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class EndpointSpec:
    name: str
    method: str
    path: str
    requires_auth: bool = False
    body: dict[str, Any] | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lightweight API load baseline runner (stdlib only).")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="API host, e.g. http://127.0.0.1:8000")
    parser.add_argument("--api-prefix", default="", help="Optional API prefix, e.g. /api")
    parser.add_argument("--requests-per-endpoint", type=int, default=30, help="Total requests per endpoint")
    parser.add_argument("--concurrency", type=int, default=8, help="Concurrent workers per endpoint")
    parser.add_argument("--timeout", type=float, default=10.0, help="Per-request timeout in seconds")
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


def send_request(
    *,
    url: str,
    method: str,
    timeout: float,
    token: str | None = None,
    payload: dict[str, Any] | None = None,
) -> tuple[int, float, str | None]:
    started = time.perf_counter()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = Request(url=url, data=_json_bytes(payload), method=method, headers=headers)

    try:
        with urlopen(request, timeout=timeout) as response:
            _ = response.read()
            status = int(response.status)
            latency_ms = (time.perf_counter() - started) * 1000.0
            return status, latency_ms, None
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        latency_ms = (time.perf_counter() - started) * 1000.0
        return int(exc.code), latency_ms, detail[:280]
    except URLError as exc:
        latency_ms = (time.perf_counter() - started) * 1000.0
        return 0, latency_ms, str(exc.reason)
    except Exception as exc:  # pragma: no cover - defensive path
        latency_ms = (time.perf_counter() - started) * 1000.0
        return 0, latency_ms, str(exc)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int(round((p / 100.0) * (len(ordered) - 1)))
    return ordered[index]


def bootstrap_user(base_url: str, api_prefix: str, timeout: float) -> tuple[str, str, str]:
    email = f"perf-{uuid.uuid4().hex[:12]}@example.com"
    password = "PerfSecret123!"

    signup_url = build_url(base_url, api_prefix, "/auth/signup")
    signup_status, _, signup_error = send_request(
        url=signup_url,
        method="POST",
        timeout=timeout,
        payload={"email": email, "password": password},
    )
    if signup_status not in (200, 201):
        raise RuntimeError(f"signup failed: status={signup_status}, error={signup_error}")

    login_url = build_url(base_url, api_prefix, "/auth/login")
    headers = {"Content-Type": "application/json"}
    request = Request(
        url=login_url,
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        method="POST",
        headers=headers,
    )
    with urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
        token = payload.get("access_token")
        if not token:
            raise RuntimeError("login response missing access_token")
    return email, password, token


def run_endpoint_load(
    *,
    spec: EndpointSpec,
    base_url: str,
    api_prefix: str,
    timeout: float,
    request_count: int,
    concurrency: int,
    token: str | None,
) -> dict[str, Any]:
    url = build_url(base_url, api_prefix, spec.path)
    latencies: list[float] = []
    successes = 0
    failures = 0
    status_counts: dict[str, int] = {}
    error_samples: list[str] = []

    def _one_call() -> tuple[int, float, str | None]:
        return send_request(
            url=url,
            method=spec.method,
            timeout=timeout,
            token=token if spec.requires_auth else None,
            payload=spec.body,
        )

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as executor:
        futures = [executor.submit(_one_call) for _ in range(request_count)]
        for future in as_completed(futures):
            status, latency_ms, error = future.result()
            latencies.append(latency_ms)
            status_key = str(status)
            status_counts[status_key] = status_counts.get(status_key, 0) + 1
            if 200 <= status < 300:
                successes += 1
            else:
                failures += 1
                if error and len(error_samples) < 5:
                    error_samples.append(error)

    return {
        "endpoint": spec.name,
        "method": spec.method,
        "path": spec.path,
        "requests": request_count,
        "successes": successes,
        "failures": failures,
        "error_rate_pct": round((failures / request_count) * 100.0, 3) if request_count else 0.0,
        "status_counts": status_counts,
        "latency_ms": {
            "min": round(min(latencies), 3) if latencies else 0.0,
            "avg": round(statistics.mean(latencies), 3) if latencies else 0.0,
            "p50": round(percentile(latencies, 50), 3) if latencies else 0.0,
            "p95": round(percentile(latencies, 95), 3) if latencies else 0.0,
            "p99": round(percentile(latencies, 99), 3) if latencies else 0.0,
            "max": round(max(latencies), 3) if latencies else 0.0,
        },
        "error_samples": error_samples,
    }


def main() -> int:
    args = parse_args()
    started = time.time()

    print("Bootstrapping auth user for perf run...")
    email, password, token = bootstrap_user(args.base_url, args.api_prefix, args.timeout)

    endpoints = [
        EndpointSpec(name="health", method="GET", path="/health"),
        EndpointSpec(
            name="login",
            method="POST",
            path="/auth/login",
            body={"email": email, "password": password},
        ),
        EndpointSpec(name="list_tenants", method="GET", path="/tenants", requires_auth=True),
    ]

    results: list[dict[str, Any]] = []
    for spec in endpoints:
        print(f"Running baseline for {spec.name} ({spec.method} {spec.path}) ...")
        endpoint_result = run_endpoint_load(
            spec=spec,
            base_url=args.base_url,
            api_prefix=args.api_prefix,
            timeout=args.timeout,
            request_count=args.requests_per_endpoint,
            concurrency=args.concurrency,
            token=token,
        )
        results.append(endpoint_result)

    ended = time.time()
    summary = {
        "generated_at_epoch": int(ended),
        "duration_seconds": round(ended - started, 3),
        "base_url": args.base_url,
        "api_prefix": args.api_prefix,
        "requests_per_endpoint": args.requests_per_endpoint,
        "concurrency": args.concurrency,
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

