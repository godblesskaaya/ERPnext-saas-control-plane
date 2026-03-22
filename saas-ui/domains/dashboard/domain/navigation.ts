export type DashboardNavItem = { href: string; label: string; hint: string };
export type DashboardNavSection = { title: string; description: string; items: DashboardNavItem[] };

export const dashboardNavSections: DashboardNavSection[] = [
  {
    title: "Tenant lifecycle",
    description: "Provisioning state, tenant health, and active operations.",
    items: [
      { href: "/dashboard/overview", label: "Operations overview", hint: "Live platform snapshot" },
      { href: "/dashboard/registry", label: "Tenant directory", hint: "Search & tenant registry" },
      { href: "/dashboard/onboarding", label: "Payment onboarding", hint: "Pending payment state" },
      { href: "/dashboard/provisioning", label: "Provisioning jobs", hint: "Deploying & upgrade queue" },
      { href: "/dashboard/incidents", label: "Failed provisioning", hint: "Incidents and failures" },
      { href: "/dashboard/suspensions", label: "Suspensions", hint: "Billing/admin suspends" },
      { href: "/dashboard/active", label: "Active tenants", hint: "Live tenants list" },
      { href: "/dashboard/activity", label: "Jobs & activity", hint: "Operational event stream" },
    ],
  },
  {
    title: "Billing & finance",
    description: "Plans, invoices, collections, and payment channels.",
    items: [
      { href: "/dashboard/billing-ops", label: "Billing operations", hint: "Dunning queue" },
      { href: "/dashboard/billing", label: "Billing follow-ups", hint: "Pending payments" },
      { href: "/dashboard/billing-details", label: "Billing analytics", hint: "Invoice breakdowns" },
    ],
  },
  {
    title: "Support & compliance",
    description: "Internal support operations and audit readiness.",
    items: [
      { href: "/dashboard/support-overview", label: "Support overview", hint: "SLA & workload" },
      { href: "/dashboard/support", label: "Support desk", hint: "Case queue" },
      { href: "/dashboard/audit", label: "Audit & policy", hint: "System events & policy" },
    ],
  },
  {
    title: "Platform health",
    description: "Infrastructure readiness and platform service checks.",
    items: [{ href: "/dashboard/platform-health", label: "Platform health", hint: "Queues and infra checks" }],
  },
];

