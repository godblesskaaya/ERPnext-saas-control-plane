export type ShellNavItem = {
  href: string;
  label: string;
  hint?: string;
  match?: string[];
  icon?: string;
};

export type ShellNavSection = {
  title: string;
  description?: string;
  items: ShellNavItem[];
};

function normalizePath(value: string): string {
  if (!value) return "/";
  const [path] = value.split(/[?#]/, 1);
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export function isShellNavItemActive(pathname: string, item: ShellNavItem): boolean {
  const normalizedPath = normalizePath(pathname);
  const candidates = [item.href, ...(item.match ?? [])].map(normalizePath);
  return candidates.some((candidate) => normalizedPath === candidate || normalizedPath.startsWith(`${candidate}/`));
}
