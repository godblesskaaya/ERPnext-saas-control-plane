function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isTenantOverviewPath(pathname: string, tenantId: string): boolean {
  const normalizedPath = normalizePath(pathname);
  const basePath = `/tenants/${tenantId}`;
  return normalizedPath === basePath || normalizedPath === `${basePath}/overview`;
}

export function isExactOrChildPath(pathname: string, href: string): boolean {
  const normalizedPathname = normalizePath(pathname);
  const normalizedHref = normalizePath(href);
  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}
