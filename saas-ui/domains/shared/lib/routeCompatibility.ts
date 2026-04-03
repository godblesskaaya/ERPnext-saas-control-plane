export type CompatibilityRouteId = "dashboard-root" | "tenant-root";

export type CompatibilityRouteResolution = {
  id: CompatibilityRouteId;
  legacyPath: string;
  canonicalPath: string;
};

const DASHBOARD_ROOT_PATTERN = /^\/dashboard\/?(?<suffix>\?.*)?$/;
const TENANT_ROOT_PATTERN = /^\/tenants\/([^/?#]+)\/?(?<suffix>\?.*)?$/;

function normalizeInputPath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function resolveCompatibilityRoute(path: string): CompatibilityRouteResolution | null {
  const normalized = normalizeInputPath(path);

  const dashboardMatch = normalized.match(DASHBOARD_ROOT_PATTERN);
  if (dashboardMatch) {
    const suffix = dashboardMatch.groups?.suffix ?? "";
    return {
      id: "dashboard-root",
      legacyPath: normalized,
      canonicalPath: `/dashboard/overview${suffix}`,
    };
  }

  const tenantMatch = normalized.match(TENANT_ROOT_PATTERN);
  if (tenantMatch) {
    const tenantId = tenantMatch[1];
    const suffix = tenantMatch.groups?.suffix ?? "";
    return {
      id: "tenant-root",
      legacyPath: normalized,
      canonicalPath: `/tenants/${tenantId}/overview${suffix}`,
    };
  }

  return null;
}

export function normalizeCompatibilityRoute(path: string): string {
  const resolution = resolveCompatibilityRoute(path);
  return resolution?.canonicalPath ?? normalizeInputPath(path);
}
