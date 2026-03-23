export type DashboardNavItem = {
  href: string;
  label: string;
  hint: string;
  match?: string[];
};

export type DashboardNavSection = {
  title: string;
  description: string;
  items: DashboardNavItem[];
};

export const dashboardNavSections: DashboardNavSection[] = [
  {
    title: "Lifecycle routing",
    description: "Track onboarding, provisioning, incidents, and tenant activity from one flow.",
    items: [
      { href: "/dashboard", label: "Workflow hub", hint: "Entry point by operational journey" },
      { href: "/dashboard/overview", label: "Overview", hint: "Platform snapshot and priorities" },
      {
        href: "/dashboard/registry",
        label: "Tenant registry",
        hint: "Search workspaces and open tenant detail",
        match: ["/tenants"],
      },
      { href: "/dashboard/onboarding", label: "Payment onboarding", hint: "Awaiting payment confirmations" },
      { href: "/dashboard/provisioning", label: "Provisioning queue", hint: "Deployments and upgrades in progress" },
      { href: "/dashboard/incidents", label: "Incidents", hint: "Provisioning failures and rescue queue" },
      { href: "/dashboard/suspensions", label: "Suspensions", hint: "Admin and billing suspends" },
      { href: "/dashboard/active", label: "Active tenants", hint: "Live customers and workspace health" },
      { href: "/dashboard/activity", label: "Jobs timeline", hint: "Recent operational events" },
    ],
  },
  {
    title: "Billing routing",
    description: "Collections, dunning actions, and invoice visibility.",
    items: [
      { href: "/dashboard/billing-ops", label: "Dunning operations", hint: "Retry cycles and billing actions" },
      { href: "/dashboard/billing", label: "Billing follow-ups", hint: "Pending payments and support handoff" },
      { href: "/dashboard/billing-details", label: "Invoice analytics", hint: "Channel and provider breakdown" },
    ],
  },
  {
    title: "Support routing",
    description: "SLA management, auditability, and escalation readiness.",
    items: [
      { href: "/dashboard/support-overview", label: "Support overview", hint: "SLA pressure and support load" },
      { href: "/dashboard/support", label: "Support queue", hint: "Case ownership and notes" },
      { href: "/dashboard/audit", label: "Audit & policy", hint: "Compliance and operational audit trail" },
    ],
  },
  {
    title: "Account routing",
    description: "User profile, notification readiness, and account settings.",
    items: [
      { href: "/dashboard/account", label: "Account summary", hint: "Identity and billing profile" },
      { href: "/dashboard/settings", label: "Settings", hint: "Notification and contact preferences" },
    ],
  },
  {
    title: "Platform routing",
    description: "Infrastructure health and control-plane readiness.",
    items: [{ href: "/dashboard/platform-health", label: "Platform health", hint: "Queues, jobs, and infra checks" }],
  },
];
