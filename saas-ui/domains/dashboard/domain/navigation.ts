export type DashboardNavMode = "operations" | "workspace";

export type DashboardNavItem = {
  href: string;
  label: string;
  hint: string;
  match?: string[];
};

export type DashboardNavSection = {
  mode: DashboardNavMode;
  title: string;
  description: string;
  items: DashboardNavItem[];
};

export const defaultDashboardNavMode: DashboardNavMode = "workspace";

export const dashboardNavSections: DashboardNavSection[] = [
  {
    mode: "operations",
    title: "Lifecycle routing",
    description: "Track onboarding, provisioning, incidents, and tenant activity from one flow.",
    items: [
      { href: "/admin/control/overview", label: "Workflow hub", hint: "Entry point by operational journey" },
      { href: "/admin/onboarding", label: "Payment onboarding", hint: "Awaiting payment confirmations" },
      { href: "/admin/provisioning", label: "Provisioning queue", hint: "Deployments and upgrades in progress" },
      { href: "/admin/incidents", label: "Incidents", hint: "Provisioning failures and rescue queue" },
      { href: "/admin/suspensions", label: "Suspensions", hint: "Admin and billing suspends" },
      { href: "/admin/activity", label: "Jobs timeline", hint: "Recent operational events" },
    ],
  },
  {
    mode: "workspace",
    title: "Workspace home",
    description: "Navigate customer-facing workspace views from one place.",
    items: [
      { href: "/dashboard/overview", label: "Overview", hint: "Workspace snapshot and priorities" },
      {
        href: "/dashboard/registry",
        label: "Tenant registry",
        hint: "Search workspaces and open workspace details",
        match: ["/tenants"],
      },
      { href: "/dashboard/active", label: "Active tenants", hint: "Live customers and workspace health" },
    ],
  },
  {
    mode: "workspace",
    title: "Customer journey queues",
    description: "Follow queue-specific customer flows in the workspace journey.",
    items: [
      { href: "/dashboard/onboarding", label: "Onboarding queue", hint: "Payment onboarding and activation readiness" },
      { href: "/dashboard/provisioning", label: "Provisioning queue", hint: "Deployments and pending upgrades" },
      { href: "/dashboard/incidents", label: "Incidents queue", hint: "Provisioning failures and rescue actions" },
      { href: "/dashboard/suspensions", label: "Suspensions queue", hint: "Workspace and billing suspension status" },
      { href: "/dashboard/support", label: "Support queue", hint: "Customer support handoff and resolution tracking" },
      { href: "/dashboard/billing-ops", label: "Billing recovery", hint: "Collections and payment follow-ups" },
      { href: "/dashboard/billing-details", label: "Invoice analytics", hint: "Invoice and provider-level breakdown" },
    ],
  },
  {
    mode: "operations",
    title: "Billing routing",
    description: "Collections, dunning actions, and invoice visibility.",
    items: [
      { href: "/admin/billing-ops", label: "Dunning operations", hint: "Retry cycles and billing actions" },
      { href: "/admin/billing", label: "Billing follow-ups", hint: "Pending payments and support handoff" },
    ],
  },
  {
    mode: "workspace",
    title: "Billing workspace",
    description: "Customer payment recovery and invoice visibility.",
    items: [{ href: "/billing", label: "Payment center", hint: "Resume checkout and review subscription invoices" }],
  },
  {
    mode: "operations",
    title: "Support routing",
    description: "SLA management, auditability, and escalation readiness.",
    items: [
      { href: "/admin/support-overview", label: "Support overview", hint: "SLA pressure and support load" },
      { href: "/admin/support", label: "Support queue", hint: "Case ownership and notes" },
      { href: "/admin/audit", label: "Audit & policy", hint: "Compliance and operational audit trail" },
    ],
  },
  {
    mode: "workspace",
    title: "Account routing",
    description: "User profile, notification readiness, and account settings.",
    items: [
      { href: "/dashboard/account", label: "Account summary", hint: "Identity and billing profile" },
      { href: "/dashboard/settings", label: "Settings", hint: "Notification and contact preferences" },
    ],
  },
  {
    mode: "operations",
    title: "Platform routing",
    description: "Infrastructure health and control-plane readiness.",
    items: [{ href: "/admin/platform-health", label: "Platform health", hint: "Queues, jobs, and infra checks" }],
  },
];

function normalizeRoute(route: string): string {
  const [pathOnly] = route.split(/[?#]/, 1);
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;

  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }

  return withLeadingSlash || "/";
}

function getRouteMatchScore(route: string, item: DashboardNavItem): number {
  const matchers = [item.href, ...(item.match ?? [])].map(normalizeRoute);
  let bestScore = -1;

  for (const matcher of matchers) {
    if (route === matcher || route.startsWith(`${matcher}/`)) {
      bestScore = Math.max(bestScore, matcher.length);
    }
  }

  return bestScore;
}

export function inferDashboardNavModeFromRoute(route: string | null | undefined): DashboardNavMode | null {
  if (!route) {
    return null;
  }

  const normalizedRoute = normalizeRoute(route);
  let bestMode: DashboardNavMode | null = null;
  let bestScore = -1;

  for (const section of dashboardNavSections) {
    for (const item of section.items) {
      const score = getRouteMatchScore(normalizedRoute, item);
      if (score > bestScore) {
        bestScore = score;
        bestMode = section.mode;
      }
    }
  }

  return bestMode;
}

export function resolveDashboardNavMode(pathname: string | null | undefined): DashboardNavMode {
  return inferDashboardNavModeFromRoute(pathname) ?? defaultDashboardNavMode;
}

export const inferActiveDashboardNavMode = inferDashboardNavModeFromRoute;
export const getDashboardNavModeFromPathname = resolveDashboardNavMode;

export function getDashboardNavSectionsByMode(mode: DashboardNavMode): DashboardNavSection[] {
  return dashboardNavSections.filter((section) => section.mode === mode);
}
