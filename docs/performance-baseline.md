# Performance & UX Validation Baseline

This document defines a lightweight, reproducible baseline for:

1. API latency/error behavior under small load
2. Onboarding SLA timing for the mock-safe path (`signup -> login -> create tenant`)

The scripts are intentionally minimal (Python stdlib only).

---

## Scripts

- `tests/performance/api_load_baseline.py`
  - Runs a small concurrent load baseline on:
    - `GET /health`
    - `POST /auth/login`
    - `GET /tenants`
  - Outputs per-endpoint latency percentiles and error rates.

- `tests/performance/onboarding_sla_baseline.py`
  - Measures elapsed time for:
    - `POST /auth/signup`
    - `POST /auth/login`
    - `POST /tenants`
  - Reports pass/fail against target `< 180s` (3 minutes).
  - Uses mock-safe assumptions (does **not** wait for paid provisioning completion).

Wrapper commands:

- `scripts/run_perf_baseline.sh`
- `scripts/run_onboarding_sla.sh`

---

## Quick run (local)

From repo root:

```bash
scripts/run_perf_baseline.sh \
  --base-url http://127.0.0.1:8000 \
  --requests-per-endpoint 30 \
  --concurrency 8 \
  --artifact artifacts/performance/api-load-baseline.json
```

```bash
scripts/run_onboarding_sla.sh \
  --base-url http://127.0.0.1:8000 \
  --target-seconds 180 \
  --artifact artifacts/performance/onboarding-sla.json
```

If routing through Traefik/API prefix, add:

```bash
--api-prefix /api
```

---

## Baseline thresholds (initial)

Recommended initial thresholds for this lightweight gate:

- **API load baseline**
  - Error rate per endpoint: `< 1%`
  - `GET /health` p95: `< 300 ms`
  - `POST /auth/login` p95: `< 800 ms`
  - `GET /tenants` p95: `< 1000 ms`

- **Onboarding SLA baseline (mock-safe)**
  - `signup -> login -> create tenant` total: `< 180 seconds`

> These are baseline guardrails, not full-scale load-test SLOs.

---

## CI artifact guidance

Store JSON outputs under:

- `artifacts/performance/api-load-baseline.json`
- `artifacts/performance/onboarding-sla.json`

In CI, upload the `artifacts/performance/` folder as build artifacts for trend tracking.

Minimal CI step sketch:

```bash
mkdir -p artifacts/performance
scripts/run_perf_baseline.sh --base-url http://127.0.0.1:8000 --artifact artifacts/performance/api-load-baseline.json
scripts/run_onboarding_sla.sh --base-url http://127.0.0.1:8000 --artifact artifacts/performance/onboarding-sla.json
```

