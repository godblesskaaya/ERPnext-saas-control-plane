import type { ShellNavSection } from "./nav";

export type WorkspaceKey = "overview" | "tenants" | "billing" | "support" | "platform" | "account";

export type WorkspaceDescriptor = {
  key: WorkspaceKey;
  label: string;
  href: string;
  description?: string;
  icon: string;
};

export const workspaceDescriptors: WorkspaceDescriptor[] = [
  { key: "overview", label: "Overview", href: "/app/overview", icon: "overview" },
  { key: "tenants", label: "Tenants", href: "/app/tenants", icon: "tenants" },
  { key: "billing", label: "Billing", href: "/app/billing/invoices", icon: "billing" },
  { key: "support", label: "Support", href: "/app/support/queue", icon: "support" },
  { key: "platform", label: "Platform", href: "/app/platform/provisioning", icon: "platform" },
  { key: "account", label: "Account", href: "/app/account/profile", icon: "account" },
];

export const workspaceLocalNavByKey: Record<WorkspaceKey, ShellNavSection> = {
  overview: {
    title: "Overview workspace",
    description: "Snapshot, alerts, and activity.",
    items: [
      { href: "/app/overview", label: "Overview", hint: "Workspace snapshot and priorities", match: ["/dashboard/overview"] },
      {
        href: "/app/overview/activity",
        label: "Recent activity",
        hint: "Latest workspace and lifecycle events",
        match: ["/dashboard/activity"],
      },
    ],
  },
  tenants: {
    title: "Tenants workspace",
    description: "Registry and lifecycle visibility.",
    items: [
      {
        href: "/app/tenants",
        label: "Registry",
        hint: "Search workspaces and open workspace details",
        match: ["/dashboard/registry", "/tenants"],
      },
      {
        href: "/app/tenants/active",
        label: "Active",
        hint: "Live customer workspaces",
        match: ["/dashboard/active"],
      },
      {
        href: "/app/tenants/suspensions",
        label: "Suspended",
        hint: "Suspension states and actions",
        match: ["/dashboard/suspensions"],
      },
    ],
  },
  billing: {
    title: "Billing workspace",
    description: "Invoices, recovery, and payment state.",
    items: [
      {
        href: "/app/billing/invoices",
        label: "Payments",
        hint: "Resume checkout and review subscription invoices",
        match: ["/billing", "/dashboard/billing", "/dashboard/billing-details"],
      },
      {
        href: "/app/billing/recovery",
        label: "Recovery",
        hint: "Payment follow-ups and invoice recovery",
        match: ["/dashboard/billing-recovery", "/dashboard/billing-ops"],
      },
    ],
  },
  support: {
    title: "Support workspace",
    description: "Queue, escalation, and SLA readiness.",
    items: [
      {
        href: "/app/support/queue",
        label: "Queue",
        hint: "Customer support handoff and resolution tracking",
        match: ["/dashboard/support"],
      },
      {
        href: "/app/support/escalations",
        label: "Escalations",
        hint: "Triage guidance and escalation checks",
        match: ["/dashboard/support-overview"],
      },
    ],
  },
  platform: {
    title: "Platform workspace",
    description: "Health, provisioning, and incidents.",
    items: [
      {
        href: "/app/platform/health",
        label: "Health",
        hint: "Infrastructure, queue, and service checks",
        match: ["/dashboard/platform-health"],
      },
      {
        href: "/app/platform/provisioning",
        label: "Provisioning",
        hint: "Deployments and pending upgrades",
        match: ["/dashboard/provisioning"],
      },
      {
        href: "/app/platform/incidents",
        label: "Incidents",
        hint: "Provisioning failures and rescue actions",
        match: ["/dashboard/incidents"],
      },
      {
        href: "/app/platform/onboarding",
        label: "Onboarding",
        hint: "Payment onboarding and activation readiness",
        match: ["/dashboard/onboarding"],
      },
    ],
  },
  account: {
    title: "Account workspace",
    description: "Profile and preferences.",
    items: [
      { href: "/app/account/profile", label: "Profile", hint: "Identity and billing profile", match: ["/dashboard/account"] },
      {
        href: "/app/account/settings",
        label: "Settings",
        hint: "Notification and contact preferences",
        match: ["/dashboard/settings"],
      },
    ],
  },
};

export const workspaceLocalNavSections: ShellNavSection[] = workspaceDescriptors.map(
  (workspace) => workspaceLocalNavByKey[workspace.key],
);

const workspaceRouteMatchers: Record<WorkspaceKey, string[]> = {
  overview: ["/app/overview", "/app/overview/activity", "/dashboard/overview", "/dashboard/activity", "/dashboard"],
  tenants: ["/app/tenants", "/dashboard/registry", "/dashboard/active", "/dashboard/suspensions", "/tenants"],
  billing: [
    "/app/billing/invoices",
    "/app/billing/recovery",
    "/billing",
    "/dashboard/billing",
    "/dashboard/billing-recovery",
    "/dashboard/billing-details",
    "/dashboard/billing-ops",
  ],
  support: ["/app/support/queue", "/app/support/escalations", "/dashboard/support", "/dashboard/support-overview"],
  platform: [
    "/app/platform/health",
    "/app/platform/provisioning",
    "/app/platform/incidents",
    "/app/platform/onboarding",
    "/dashboard/platform-health",
    "/dashboard/provisioning",
    "/dashboard/incidents",
    "/dashboard/onboarding",
  ],
  account: ["/app/account/profile", "/app/account/settings", "/dashboard/account", "/dashboard/settings"],
};

function normalizeRoute(pathname: string): string {
  const [pathOnly] = pathname.split(/[?#]/, 1);
  const route = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  if (route.length > 1 && route.endsWith("/")) {
    return route.slice(0, -1);
  }
  return route || "/";
}

export function resolveWorkspaceKeyFromPath(pathname: string | null | undefined): WorkspaceKey {
  if (!pathname) return "overview";
  const normalized = normalizeRoute(pathname);

  for (const descriptor of workspaceDescriptors) {
    const matchers = workspaceRouteMatchers[descriptor.key];
    if (matchers.some((matcher) => normalized === matcher || normalized.startsWith(`${matcher}/`))) {
      return descriptor.key;
    }
  }

  return "overview";
}

export function getWorkspaceLocalNavForPath(pathname: string | null | undefined): ShellNavSection {
  return workspaceLocalNavByKey[resolveWorkspaceKeyFromPath(pathname)];
}
