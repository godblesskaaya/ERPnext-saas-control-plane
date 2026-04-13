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
    title: "Control plane",
    description: "Operator command lanes for fleet, jobs, audit, support, and recovery.",
    items: [
      { href: "/app/admin/control-overview", label: "Control overview", hint: "Global metrics and intervention lane" },
      { href: "/app/admin/tenant-control", label: "Tenant control", hint: "Lifecycle actions, status, and account health" },
      { href: "/app/admin/jobs", label: "Job execution", hint: "Inspect orchestration runs and logs" },
      { href: "/app/admin/audit", label: "Audit log", hint: "Compliance history and operator events" },
      { href: "/app/admin/support-tools", label: "Support tooling", hint: "Impersonation and escalation workflows" },
      { href: "/app/admin/recovery", label: "Recovery queue", hint: "Dead-letter triage and requeue actions" },
    ],
  },
  {
    title: "Tenant lifecycle",
    description: "Track customer journey from onboarding to provisioning and incident recovery.",
    items: [
      { href: "/app/admin/onboarding", label: "Payment onboarding", hint: "Awaiting payment confirmations and activation state" },
      { href: "/app/admin/provisioning", label: "Provisioning queue", hint: "Deployments, retries, and stuck lifecycle runs" },
      { href: "/app/admin/incidents", label: "Incidents", hint: "Failure triage and recovery actions" },
      { href: "/app/admin/suspensions", label: "Suspensions", hint: "Admin and billing suspension workflows" },
      { href: "/app/admin/activity", label: "Lifecycle activity", hint: "Recent queue events and action outcomes" },
    ],
  },
  {
    title: "Revenue operations",
    description: "Billing retries, dunning actions, and payment escalation handling.",
    items: [
      { href: "/app/admin/billing-ops", label: "Billing operations", hint: "Dunning, retries, and payment escalations" },
      { href: "/app/admin/billing", label: "Billing follow-ups", hint: "Payment failures by channel and status" },
    ],
  },
  {
    title: "Governance and support",
    description: "Compliance visibility, customer escalation, and operator assist tools.",
    items: [
      { href: "/app/admin/support-overview", label: "Support overview", hint: "SLA pressure and support load" },
      { href: "/app/admin/support", label: "Support queue", hint: "Cases, notes, and SLA visibility" },
      { href: "/app/admin/audit", label: "Audit & policy", hint: "Compliance trail and export workflows" },
    ],
  },
  {
    title: "Platform reliability",
    description: "Infrastructure health and service readiness indicators.",
    items: [
      { href: "/app/admin/platform-health", label: "Platform health", hint: "Infrastructure, queue, and service checks" },
    ],
  },
];
