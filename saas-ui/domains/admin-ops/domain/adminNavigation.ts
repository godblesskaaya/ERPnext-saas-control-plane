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
      { href: "/admin/control/overview", label: "Control overview", hint: "Global metrics and intervention lane" },
      { href: "/admin/control/tenants", label: "Tenant control", hint: "Lifecycle actions, status, and account health" },
      { href: "/admin/control/jobs", label: "Job execution", hint: "Inspect orchestration runs and logs" },
      { href: "/admin/control/audit", label: "Audit log", hint: "Compliance history and operator events" },
      { href: "/admin/control/support", label: "Support tooling", hint: "Impersonation and escalation workflows" },
      { href: "/admin/control/recovery", label: "Recovery queue", hint: "Dead-letter triage and requeue actions" },
    ],
  },
  {
    title: "Tenant lifecycle",
    description: "Track customer journey from onboarding to provisioning and incident recovery.",
    items: [
      { href: "/admin/onboarding", label: "Payment onboarding", hint: "Awaiting payment confirmations and activation state" },
      { href: "/admin/provisioning", label: "Provisioning queue", hint: "Deployments, retries, and stuck lifecycle runs" },
      { href: "/admin/incidents", label: "Incidents", hint: "Failure triage and recovery actions" },
      { href: "/admin/suspensions", label: "Suspensions", hint: "Admin and billing suspension workflows" },
      { href: "/admin/activity", label: "Lifecycle activity", hint: "Recent queue events and action outcomes" },
    ],
  },
  {
    title: "Revenue operations",
    description: "Billing retries, dunning actions, and payment escalation handling.",
    items: [
      { href: "/admin/billing-ops", label: "Billing operations", hint: "Dunning, retries, and payment escalations" },
      { href: "/admin/billing", label: "Billing follow-ups", hint: "Payment failures by channel and status" },
    ],
  },
  {
    title: "Governance and support",
    description: "Compliance visibility, customer escalation, and operator assist tools.",
    items: [
      { href: "/admin/support-overview", label: "Support overview", hint: "SLA pressure and support load" },
      { href: "/admin/support", label: "Support queue", hint: "Cases, notes, and SLA visibility" },
      { href: "/admin/audit", label: "Audit & policy", hint: "Compliance trail and export workflows" },
    ],
  },
  {
    title: "Platform reliability",
    description: "Infrastructure health and service readiness indicators.",
    items: [
      { href: "/admin/platform-health", label: "Platform health", hint: "Infrastructure, queue, and service checks" },
    ],
  },
];
