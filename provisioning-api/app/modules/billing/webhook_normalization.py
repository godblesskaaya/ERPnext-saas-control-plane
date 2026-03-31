from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import json
from urllib.parse import parse_qs


def to_minor_units(value: object) -> int | None:
    if value is None:
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return int((amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def sanitize_headers(headers: dict[str, str]) -> dict[str, str]:
    blocked = {"authorization", "cookie", "set-cookie", "x-api-key"}
    result: dict[str, str] = {}
    for key, value in headers.items():
        lower = key.lower()
        if lower in blocked:
            continue
        result[lower] = value
    return result


def decode_payload(payload: bytes, headers: dict[str, str]) -> dict:
    text = payload.decode("utf-8", errors="replace")
    content_type = (headers.get("content-type") or headers.get("Content-Type") or "").lower()
    if "application/json" in content_type:
        try:
            parsed = json.loads(text or "{}")
        except json.JSONDecodeError:
            return {"raw": text}
        if isinstance(parsed, dict):
            return parsed
        return {"value": parsed}
    if "application/x-www-form-urlencoded" in content_type:
        parsed_form = parse_qs(text, keep_blank_values=True)
        return {key: values[0] if values else "" for key, values in parsed_form.items()}
    return {"raw": text}


def resolve_processing_status(message: str) -> str:
    if message.startswith("processed:"):
        return "processed"
    if message.startswith("ignored:"):
        return "ignored"
    return "unknown"


def build_outbox_dedup_key(*, provider: str, event_type: str, tenant_id: str | None, subscription_id: str | None, raw: dict) -> str:
    payload = json.dumps(raw, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{provider}:{event_type}:{tenant_id or '-'}:{subscription_id or '-'}:{digest}"
