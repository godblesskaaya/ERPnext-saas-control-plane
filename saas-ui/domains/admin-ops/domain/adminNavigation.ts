export type AdminNavItem = {
  href: string;
  label: string;
  hint: string;
};

export type AdminNavSection = {
  title: string;
  description: string;
  items: AdminNavItem[];
};

export const adminNavSections: AdminNavSection[] = [
  {
    title: "Control tower",
    description: "Platform-wide controls and privileged operations.",
    items: [{ href: "/admin", label: "Admin console", hint: "Tenants, jobs, audit, impersonation" }],
  },
  {
    title: "Operational handoff",
    description: "Jump into user-facing workflows when escalation is needed.",
    items: [
      { href: "/dashboard/overview", label: "User operations", hint: "Tenant lifecycle and queues" },
      { href: "/dashboard/platform-health", label: "Platform health", hint: "Queues and infrastructure checks" },
      { href: "/dashboard/audit", label: "Audit & policy", hint: "Compliance trail and exports" },
      { href: "/dashboard/billing-ops", label: "Billing operations", hint: "Dunning and payment escalations" },
    ],
  },
];
