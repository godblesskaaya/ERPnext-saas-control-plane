from __future__ import annotations

import re

from app.config import get_settings


SUBDOMAIN_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$")
DOMAIN_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.-]{1,253}[a-z0-9]$")
APP_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{1,30}$")
BUSINESS_APPS = frozenset(
    {
        "crm",
        "hrms",
        "frappe_whatsapp",
        "posawesome",
        "lms",
        "helpdesk",
        "payments",
        "lending",
    }
)
BLOCKLIST = frozenset(
    {
        "admin",
        "api",
        "platform",
        "billing",
        "mail",
        "smtp",
        "ns1",
        "ns2",
        "www",
        "ftp",
        "ssh",
        "vpn",
        "cdn",
        "blenko",
        "support",
        "help",
        "status",
        "monitor",
        "metrics",
        "grafana",
    }
)


class ValidationError(ValueError):
    pass


settings = get_settings()


def validate_subdomain(subdomain: str) -> str:
    cleaned = subdomain.strip().lower()
    if cleaned in BLOCKLIST:
        raise ValidationError("This subdomain is reserved")
    if not SUBDOMAIN_PATTERN.fullmatch(cleaned):
        raise ValidationError("Invalid subdomain")
    return cleaned


def validate_domain(domain: str) -> str:
    cleaned = domain.strip().lower()
    if not DOMAIN_PATTERN.fullmatch(cleaned):
        raise ValidationError("Invalid domain")
    expected_suffix = f".{settings.tenant_domain_suffix}"
    if not cleaned.endswith(expected_suffix):
        raise ValidationError(f"Domain must end with {expected_suffix}")
    return cleaned


def validate_custom_domain(domain: str) -> str:
    cleaned = domain.strip().lower()
    if not DOMAIN_PATTERN.fullmatch(cleaned):
        raise ValidationError("Invalid domain")
    platform_suffix = f".{settings.tenant_domain_suffix}"
    if cleaned.endswith(platform_suffix):
        raise ValidationError(f"Custom domains cannot end with {platform_suffix}")
    return cleaned


def validate_plan(plan: str) -> str:
    cleaned = plan.strip().lower()
    if cleaned not in settings.allowed_plan_set:
        raise ValidationError("Unsupported plan")
    return cleaned


def validate_app_name(app_name: str) -> str:
    cleaned = app_name.strip().lower()
    if not APP_PATTERN.fullmatch(cleaned):
        raise ValidationError("Invalid app name")
    if cleaned not in ({"erpnext"} | BUSINESS_APPS):
        raise ValidationError("App is not allowlisted")
    return cleaned


def validate_admin_password(password: str) -> str:
    cleaned = password.strip()
    if len(cleaned) < 8:
        raise ValidationError("Administrator password must be at least 8 characters")
    if any(char.isspace() for char in cleaned):
        raise ValidationError("Administrator password cannot contain spaces")
    return cleaned


def domain_from_subdomain(subdomain: str) -> str:
    clean = validate_subdomain(subdomain)
    return f"{clean}.{settings.tenant_domain_suffix}"
