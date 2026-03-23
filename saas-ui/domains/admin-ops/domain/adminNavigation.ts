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
    title: "Admin operations routes",
    description: "Dedicated admin surfaces with clear separation from user workspace routes.",
    items: [
      { href: "/admin/onboarding", label: "Payment onboarding", hint: "Awaiting payment confirmations and activation state" },
      { href: "/admin/provisioning", label: "Provisioning queue", hint: "Deployments, retries, and stuck lifecycle runs" },
      { href: "/admin/incidents", label: "Incidents", hint: "Failure triage and recovery actions" },
      { href: "/admin/billing-ops", label: "Billing operations", hint: "Dunning, retries, and payment escalations" },
      { href: "/admin/platform-health", label: "Platform health", hint: "Infrastructure, queue, and service checks" },
      { href: "/admin/audit", label: "Audit & policy", hint: "Compliance trail and export workflows" },
      { href: "/admin/support", label: "Support queue", hint: "Cases, notes, and SLA visibility" },
    ],
  },
];
