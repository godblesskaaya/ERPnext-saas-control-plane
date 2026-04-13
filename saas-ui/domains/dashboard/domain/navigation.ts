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
      { href: "/app/admin/control-overview", label: "Workflow hub", hint: "Entry point by operational journey" },
      { href: "/app/platform/onboarding", label: "Payment onboarding", hint: "Awaiting payment confirmations" },
      { href: "/app/platform/provisioning", label: "Provisioning queue", hint: "Deployments and upgrades in progress" },
      { href: "/app/platform/incidents", label: "Incidents", hint: "Provisioning failures and rescue queue" },
      { href: "/app/tenants/suspensions", label: "Suspensions", hint: "Admin and billing suspends" },
      { href: "/app/overview/activity", label: "Jobs timeline", hint: "Recent operational events" },
    ],
  },
  {
    mode: "workspace",
    title: "Overview workspace",
    description: "Workspace snapshot, live activity, and customer-facing health signals.",
    items: [
      { href: "/app/overview", label: "Overview", hint: "Workspace snapshot and priorities" },
      { href: "/app/tenants/active", label: "Active workspaces", hint: "Live customers and workspace health" },
      { href: "/app/overview/activity", label: "Activity feed", hint: "Recent workspace lifecycle changes" },
    ],
  },
  {
    mode: "workspace",
    title: "Tenants workspace",
    description: "Find tenants, review status, and continue workspace detail journeys.",
    items: [
      {
        href: "/app/tenants",
        label: "Workspace registry",
        hint: "Search workspaces and open workspace details",
        match: ["/tenants"],
      },
    ],
  },
  {
    mode: "workspace",
    title: "Billing workspace",
    description: "Customer payment recovery and invoice visibility.",
    items: [
      {
        href: "/app/billing/recovery",
        label: "Billing recovery",
        hint: "Payment follow-ups and invoice recovery",
      },
      { href: "/app/billing/invoices", label: "Invoice analytics", hint: "Invoice and provider-level breakdown" },
      { href: "/app/billing/invoices", label: "Payment center", hint: "Resume checkout and review subscription invoices" },
    ],
  },
  {
    mode: "operations",
    title: "Billing routing",
    description: "Collections, dunning actions, and invoice visibility.",
    items: [
      { href: "/app/admin/billing-ops", label: "Dunning operations", hint: "Retry cycles and billing actions" },
      { href: "/app/admin/billing-ops", label: "Billing follow-ups", hint: "Pending payments and support handoff" },
    ],
  },
  {
    mode: "workspace",
    title: "Support workspace",
    description: "Support case routing, escalation readiness, and customer handoff.",
    items: [
      { href: "/app/support/queue", label: "Support queue", hint: "Customer support handoff and resolution tracking" },
      { href: "/app/support/escalations", label: "Support overview", hint: "Triage guidance and escalation checks" },
    ],
  },
  {
    mode: "operations",
    title: "Support routing",
    description: "SLA management, auditability, and escalation readiness.",
    items: [
      { href: "/app/support/escalations", label: "Support overview", hint: "SLA pressure and support load" },
      { href: "/app/admin/support-tools", label: "Support queue", hint: "Case ownership and notes" },
      { href: "/app/admin/audit", label: "Audit & policy", hint: "Compliance and operational audit trail" },
    ],
  },
  {
    mode: "workspace",
    title: "Platform workspace",
    description: "Provisioning, incident recovery, onboarding flow, and suspension tracking.",
    items: [
      { href: "/app/platform/onboarding", label: "Onboarding queue", hint: "Payment onboarding and activation readiness" },
      { href: "/app/platform/provisioning", label: "Provisioning queue", hint: "Deployments and pending upgrades" },
      { href: "/app/platform/incidents", label: "Incidents queue", hint: "Provisioning failures and rescue actions" },
      { href: "/app/tenants/suspensions", label: "Suspensions queue", hint: "Workspace and billing suspension status" },
    ],
  },
  {
    mode: "workspace",
    title: "Account workspace",
    description: "User profile, notification readiness, and account settings.",
    items: [
      { href: "/app/account/profile", label: "Account summary", hint: "Identity and billing profile" },
      { href: "/app/account/settings", label: "Settings", hint: "Notification and contact preferences" },
    ],
  },
  {
    mode: "operations",
    title: "Platform routing",
    description: "Infrastructure health and control-plane readiness.",
    items: [{ href: "/app/admin/platform-health", label: "Platform health", hint: "Queues, jobs, and infra checks" }],
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
