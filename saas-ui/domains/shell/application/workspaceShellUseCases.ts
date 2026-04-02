type BreadcrumbEntry = {
  label: string;
  href?: string;
};

function titleCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function buildWorkspaceBreadcrumbs(pathname: string, rootLabel: string, rootHref: string): BreadcrumbEntry[] {
  const [pathOnly] = pathname.split(/[?#]/, 1);
  const normalized = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ label: rootLabel, href: rootHref }];
  }

  const crumbs: BreadcrumbEntry[] = [{ label: rootLabel, href: rootHref }];

  let cursor = "";
  for (const segment of segments) {
    cursor += `/${segment}`;
    const isTerminal = cursor === normalized;
    crumbs.push({ label: titleCase(segment), href: isTerminal ? undefined : cursor });
  }

  return crumbs;
}
