function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function tenantRoots(tenantId: string): string[] {
  return [`/app/tenants/${tenantId}`, `/tenants/${tenantId}`];
}

export function isTenantOverviewPath(pathname: string, tenantId: string): boolean {
  const normalizedPath = normalizePath(pathname);
  const [appBase, legacyBase] = tenantRoots(tenantId);
  return (
    normalizedPath === appBase ||
    normalizedPath === `${appBase}/overview` ||
    normalizedPath === legacyBase ||
    normalizedPath === `${legacyBase}/overview`
  );
}

export function isExactOrChildPath(pathname: string, href: string): boolean {
  const normalizedPathname = normalizePath(pathname);
  const normalizedHref = normalizePath(href);
  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}
