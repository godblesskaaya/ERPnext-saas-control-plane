from __future__ import annotations

from collections import OrderedDict


LEGACY_ENTERPRISE_APPS = (
    "crm",
    "hrms",
    "frappe_whatsapp",
    "posawesome",
    "lms",
    "helpdesk",
    "payments",
    "lending",
)


def derive_app_install_list(tenant) -> list[str]:
    """
    Derive install list from subscription entitlements first, then fallback to legacy fields.
    """
    ordered_apps: "OrderedDict[str, None]" = OrderedDict()

    subscription = getattr(tenant, "subscription", None)
    plan = getattr(subscription, "plan", None)
    entitlements = getattr(plan, "entitlements", None) or []
    for entitlement in entitlements:
        if getattr(entitlement, "mandatory", False):
            app_slug = (getattr(entitlement, "app_slug", "") or "").strip().lower()
            if app_slug:
                ordered_apps[app_slug] = None

    if not entitlements:
        ordered_apps["erpnext"] = None

    selected_app = (
        (getattr(subscription, "selected_app", None) if subscription else None)
        or getattr(tenant, "chosen_app", None)
    )
    if selected_app:
        cleaned = str(selected_app).strip().lower()
        if cleaned:
            ordered_apps[cleaned] = None

    # AGENT-NOTE: In test/reset environments tenants can exist without subscription rows.
    # Keep a bounded legacy fallback here so Phase 4 dispatch does not regress existing
    # pooled behavior while migration-backed subscription ownership is rolled out.
    legacy_plan = (getattr(tenant, "plan", "") or "").strip().lower()
    if legacy_plan == "enterprise":
        ordered_apps["erpnext"] = None
        for app_slug in LEGACY_ENTERPRISE_APPS:
            ordered_apps[app_slug] = None

    if not ordered_apps:
        ordered_apps["erpnext"] = None

    return list(ordered_apps.keys())
