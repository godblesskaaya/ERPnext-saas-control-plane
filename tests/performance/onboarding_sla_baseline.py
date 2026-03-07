#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Onboarding SLA baseline (signup->login->create-tenant mock path).")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="API host, e.g. http://127.0.0.1:8000")
    parser.add_argument("--api-prefix", default="", help="Optional API prefix, e.g. /api")
    parser.add_argument("--plan", default="starter", choices=["starter", "business", "enterprise"])
    parser.add_argument("--chosen-app", default="", help="Required only when --plan=business in some deployments")
    parser.add_argument("--target-seconds", type=float, default=180.0, help="SLA target in seconds (default: 3 minutes)")
    parser.add_argument("--timeout", type=float, default=15.0, help="Per-request timeout")
    parser.add_argument("--artifact", default="", help="Optional JSON artifact output path")
    return parser.parse_args()


def build_url(base_url: str, api_prefix: str, path: str) -> str:
    base = base_url.rstrip("/")
    prefix = f"/{api_prefix.strip('/')}" if api_prefix.strip("/") else ""
    return f"{base}{prefix}{path}"


def request_json(
    *,
    url: str,
    method: str,
    timeout: float,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
) -> tuple[int, dict[str, Any] | str]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url=url, data=data, method=method, headers=headers)
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            try:
                parsed: dict[str, Any] | str = json.loads(body)
            except json.JSONDecodeError:
                parsed = body
            return int(response.status), parsed
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = body
        return int(exc.code), parsed
    except URLError as exc:
        return 0, str(exc.reason)


def main() -> int:
    args = parse_args()
    began = time.perf_counter()

    email = f"sla-{uuid.uuid4().hex[:12]}@example.com"
    password = "Onboarding123!"
    subdomain = f"sla-{uuid.uuid4().hex[:8]}"

    timeline: list[dict[str, Any]] = []

    step_started = time.perf_counter()
    signup_status, signup_payload = request_json(
        url=build_url(args.base_url, args.api_prefix, "/auth/signup"),
        method="POST",
        timeout=args.timeout,
        payload={"email": email, "password": password},
    )
    timeline.append(
        {
            "step": "signup",
            "status": signup_status,
            "elapsed_ms": round((time.perf_counter() - step_started) * 1000.0, 3),
        }
    )
    if signup_status not in (200, 201):
        raise SystemExit(f"signup failed: status={signup_status}, payload={signup_payload}")

    step_started = time.perf_counter()
    login_status, login_payload = request_json(
        url=build_url(args.base_url, args.api_prefix, "/auth/login"),
        method="POST",
        timeout=args.timeout,
        payload={"email": email, "password": password},
    )
    timeline.append(
        {
            "step": "login",
            "status": login_status,
            "elapsed_ms": round((time.perf_counter() - step_started) * 1000.0, 3),
        }
    )
    if login_status != 200 or not isinstance(login_payload, dict) or not login_payload.get("access_token"):
        raise SystemExit(f"login failed: status={login_status}, payload={login_payload}")
    token = str(login_payload["access_token"])

    create_payload: dict[str, Any] = {
        "subdomain": subdomain,
        "company_name": f"SLA {subdomain}",
        "plan": args.plan,
    }
    if args.chosen_app.strip():
        create_payload["chosen_app"] = args.chosen_app.strip().lower()

    step_started = time.perf_counter()
    create_status, create_result = request_json(
        url=build_url(args.base_url, args.api_prefix, "/tenants"),
        method="POST",
        timeout=args.timeout,
        token=token,
        payload=create_payload,
    )
    timeline.append(
        {
            "step": "create_tenant",
            "status": create_status,
            "elapsed_ms": round((time.perf_counter() - step_started) * 1000.0, 3),
        }
    )
    if create_status not in (200, 202):
        raise SystemExit(f"create tenant failed: status={create_status}, payload={create_result}")

    total_seconds = time.perf_counter() - began
    passed = total_seconds < args.target_seconds

    summary = {
        "base_url": args.base_url,
        "api_prefix": args.api_prefix,
        "plan": args.plan,
        "chosen_app": create_payload.get("chosen_app"),
        "target_seconds": args.target_seconds,
        "elapsed_seconds": round(total_seconds, 3),
        "passed": passed,
        "timeline": timeline,
        "tenant_create_payload": create_payload,
        "tenant_create_response": create_result,
        "note": "This SLA baseline covers signup/login/create-tenant mock-safe path (not full paid provisioning completion).",
    }

    print(json.dumps(summary, indent=2))

    if args.artifact:
        artifact_path = Path(args.artifact)
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"Artifact written: {artifact_path}")

    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())

