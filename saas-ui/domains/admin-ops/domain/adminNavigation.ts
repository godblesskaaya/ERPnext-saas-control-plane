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
    title: "Monolith admin console",
    description: "Control-plane areas inside /admin for privileged operators.",
    items: [
      { href: "/admin?view=overview", label: "Control overview", hint: "Global metrics and intervention lane" },
      { href: "/admin?view=tenants", label: "Tenant control", hint: "Lifecycle actions, status, and account health" },
      { href: "/admin?view=jobs", label: "Job execution", hint: "Inspect orchestration runs and logs" },
      { href: "/admin?view=audit", label: "Audit log", hint: "Compliance history and operator events" },
      { href: "/admin?view=support", label: "Support tooling", hint: "Impersonation and escalation workflows" },
      { href: "/admin?view=recovery", label: "Recovery queue", hint: "Dead-letter triage and requeue actions" },
    ],
  },
  {
    title: "Operational handoff",
    description: "Escalate into dashboard surfaces when user-facing action is required.",
    items: [
      { href: "/dashboard/overview", label: "Dashboard: Tenant operations", hint: "Tenant lifecycle and queue handling" },
      { href: "/dashboard/platform-health", label: "Dashboard: Platform health", hint: "Infrastructure and queue checks" },
      { href: "/dashboard/audit", label: "Dashboard: Audit & policy", hint: "Compliance trail and export workflows" },
      { href: "/dashboard/billing-ops", label: "Dashboard: Billing operations", hint: "Dunning and payment escalations" },
    ],
  },
];
