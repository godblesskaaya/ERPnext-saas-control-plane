export type AdminView = "overview" | "tenants" | "jobs" | "audit" | "support" | "recovery";

export const ADMIN_VIEWS: AdminView[] = ["overview", "tenants", "jobs", "audit", "support", "recovery"];

export const ADMIN_VIEW_ROUTES: Record<AdminView, string> = {
  overview: "/app/admin/control-overview",
  tenants: "/app/admin/tenant-control",
  jobs: "/app/admin/jobs",
  audit: "/app/admin/audit",
  support: "/app/admin/support-tools",
  recovery: "/app/admin/recovery",
};

export const ADMIN_VIEW_DETAILS: Record<AdminView, { label: string; description: string }> = {
  overview: { label: "Overview", description: "Platform health summary and control shortcuts." },
  tenants: { label: "Tenants", description: "Review status and run tenant lifecycle interventions." },
  jobs: { label: "Jobs", description: "Inspect orchestration runs and job logs." },
  audit: { label: "Audit", description: "Track administrative actions and export records." },
  support: { label: "Support", description: "Issue short-lived impersonation links for troubleshooting." },
  recovery: { label: "Recovery", description: "Handle dead-letter jobs and replay failures." },
};

const ADMIN_ROUTE_VIEW_ENTRIES = Object.entries(ADMIN_VIEW_ROUTES) as Array<[AdminView, string]>;

export function inferAdminViewFromPathname(pathname: string): AdminView | null {
  for (const [view, route] of ADMIN_ROUTE_VIEW_ENTRIES) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return view;
    }
  }
  return null;
}
