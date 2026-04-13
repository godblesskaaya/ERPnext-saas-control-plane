export type CompatibilityRouteId =
  | "dashboard-root"
  | "dashboard-route"
  | "dashboard-billing"
  | "billing-root"
  | "tenant-root"
  | "tenant-detail"
  | "admin-view"
  | "admin-control-route"
  | "admin-control-support";

export type CompatibilityRouteResolution = {
  id: CompatibilityRouteId;
  legacyPath: string;
  canonicalPath: string;
};

type StaticRouteAlias = {
  id: CompatibilityRouteId;
  legacy: string;
  canonical: string;
};

const STATIC_ROUTE_ALIASES: StaticRouteAlias[] = [
  { id: "dashboard-root", legacy: "/dashboard", canonical: "/app/overview" },
  { id: "dashboard-route", legacy: "/dashboard/overview", canonical: "/app/overview" },
  { id: "dashboard-route", legacy: "/dashboard/activity", canonical: "/app/overview/activity" },
  { id: "dashboard-route", legacy: "/dashboard/registry", canonical: "/app/tenants" },
  { id: "dashboard-route", legacy: "/dashboard/active", canonical: "/app/tenants/active" },
  { id: "dashboard-route", legacy: "/dashboard/suspensions", canonical: "/app/tenants/suspensions" },
  { id: "dashboard-billing", legacy: "/dashboard/billing", canonical: "/app/billing/invoices" },
  { id: "dashboard-billing", legacy: "/dashboard/billing-details", canonical: "/app/billing/invoices" },
  { id: "dashboard-billing", legacy: "/dashboard/billing-recovery", canonical: "/app/billing/recovery" },
  { id: "dashboard-route", legacy: "/dashboard/support", canonical: "/app/support/queue" },
  { id: "dashboard-route", legacy: "/dashboard/support-overview", canonical: "/app/support/escalations" },
  { id: "dashboard-route", legacy: "/dashboard/platform-health", canonical: "/app/platform/health" },
  { id: "dashboard-route", legacy: "/dashboard/provisioning", canonical: "/app/platform/provisioning" },
  { id: "dashboard-route", legacy: "/dashboard/incidents", canonical: "/app/platform/incidents" },
  { id: "dashboard-route", legacy: "/dashboard/onboarding", canonical: "/app/platform/onboarding" },
  { id: "dashboard-route", legacy: "/dashboard/account", canonical: "/app/account/profile" },
  { id: "dashboard-route", legacy: "/dashboard/settings", canonical: "/app/account/settings" },
  { id: "billing-root", legacy: "/billing", canonical: "/app/billing/invoices" },
  { id: "admin-control-route", legacy: "/admin/control/overview", canonical: "/app/admin/control-overview" },
  { id: "admin-control-route", legacy: "/admin/control/tenants", canonical: "/app/admin/tenant-control" },
  { id: "admin-control-route", legacy: "/admin/control/jobs", canonical: "/app/admin/jobs" },
  { id: "admin-control-route", legacy: "/admin/control/audit", canonical: "/app/admin/audit" },
  { id: "admin-control-support", legacy: "/admin/control/support", canonical: "/app/admin/support-tools" },
  { id: "admin-control-route", legacy: "/admin/control/recovery", canonical: "/app/admin/recovery" },
  { id: "admin-control-route", legacy: "/admin/billing-ops", canonical: "/app/admin/billing-ops" },
  { id: "admin-control-route", legacy: "/admin/platform-health", canonical: "/app/admin/platform-health" },
];

const TENANT_ROOT_PATTERN = /^\/tenants\/([^/?#]+)\/?(?<suffix>\?.*)?$/;
const TENANT_TAB_PATTERN = /^\/tenants\/([^/?#]+)\/(overview|members|domains|billing|jobs|audit|backups|support)\/?(?<suffix>\?.*)?$/;
const LEGACY_ADMIN_VIEW_ROUTE_BY_VIEW: Record<string, string> = {
  overview: "/app/admin/control-overview",
  tenants: "/app/admin/tenant-control",
  jobs: "/app/admin/jobs",
  audit: "/app/admin/audit",
  support: "/app/admin/support-tools",
  recovery: "/app/admin/recovery",
};

function normalizeInputPath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function splitPathAndQuery(path: string): { pathname: string; query: string } {
  const [pathname, query = ""] = path.split("?", 2);
  return { pathname: pathname || "/", query: query ? `?${query}` : "" };
}

export function resolveCompatibilityRoute(path: string): CompatibilityRouteResolution | null {
  const normalized = normalizeInputPath(path);
  const { pathname, query } = splitPathAndQuery(normalized);

  if (pathname === "/admin") {
    const params = new URLSearchParams(query.slice(1));
    const view = params.get("view") || "overview";
    const canonical = LEGACY_ADMIN_VIEW_ROUTE_BY_VIEW[view] ?? LEGACY_ADMIN_VIEW_ROUTE_BY_VIEW.overview;
    params.delete("view");
    const suffix = params.toString();

    return {
      id: "admin-view",
      legacyPath: normalized,
      canonicalPath: `${canonical}${suffix ? `?${suffix}` : ""}`,
    };
  }

  const staticAlias = STATIC_ROUTE_ALIASES.find((alias) => alias.legacy === pathname);
  if (staticAlias) {
    return {
      id: staticAlias.id,
      legacyPath: normalized,
      canonicalPath: `${staticAlias.canonical}${query}`,
    };
  }

  const tenantRootMatch = normalized.match(TENANT_ROOT_PATTERN);
  if (tenantRootMatch) {
    const tenantId = tenantRootMatch[1];
    const suffix = tenantRootMatch.groups?.suffix ?? "";
    return {
      id: "tenant-root",
      legacyPath: normalized,
      canonicalPath: `/app/tenants/${tenantId}/overview${suffix}`,
    };
  }

  const tenantTabMatch = normalized.match(TENANT_TAB_PATTERN);
  if (tenantTabMatch) {
    const tenantId = tenantTabMatch[1];
    const tab = tenantTabMatch[2];
    const suffix = tenantTabMatch.groups?.suffix ?? "";
    return {
      id: "tenant-detail",
      legacyPath: normalized,
      canonicalPath: `/app/tenants/${tenantId}/${tab}${suffix}`,
    };
  }

  return null;
}

export function normalizeCompatibilityRoute(path: string): string {
  const resolution = resolveCompatibilityRoute(path);
  return resolution?.canonicalPath ?? normalizeInputPath(path);
}
