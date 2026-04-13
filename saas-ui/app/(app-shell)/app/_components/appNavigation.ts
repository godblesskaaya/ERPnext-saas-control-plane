import type { ShellNavSection } from "../../../../domains/shell/model/nav";

const overviewSection: ShellNavSection = {
  title: "Overview",
  description: "Command center",
  items: [{ href: "/app/overview", label: "Overview", hint: "Workspace and platform summary", icon: "overview" }],
};

const tenantsSection: ShellNavSection = {
  title: "Tenants",
  description: "Registry and lifecycle",
  items: [
    { href: "/app/tenants", label: "Registry", hint: "Search and open tenant workspaces", icon: "tenants" },
    { href: "/app/tenants/active", label: "Active", hint: "Live tenants and steady-state monitoring", icon: "tenants" },
    { href: "/app/tenants/suspensions", label: "Suspensions", hint: "Billing and admin suspension states", icon: "tenants" },
  ],
};

const billingSection: ShellNavSection = {
  title: "Billing",
  description: "Invoices and recovery",
  items: [
    { href: "/app/billing/invoices", label: "Invoices", hint: "Invoice history and payment resume", icon: "billing" },
    { href: "/app/billing/recovery", label: "Recovery", hint: "Failed payment follow-up", icon: "billing" },
  ],
};

const supportSection: ShellNavSection = {
  title: "Support",
  description: "Queue and escalations",
  items: [
    { href: "/app/support/queue", label: "Queue", hint: "Customer-facing triage", icon: "support" },
    { href: "/app/support/escalations", label: "Escalations", hint: "SLA and handoff context", icon: "support" },
  ],
};

const platformSection: ShellNavSection = {
  title: "Platform",
  description: "Health and provisioning",
  items: [
    { href: "/app/platform/health", label: "Health", hint: "Core service status", icon: "platform" },
    { href: "/app/platform/provisioning", label: "Provisioning", hint: "Provisioning queue and retries", icon: "platform" },
    { href: "/app/platform/incidents", label: "Incidents", hint: "Operational incidents", icon: "platform" },
    { href: "/app/platform/onboarding", label: "Onboarding", hint: "Activation readiness", icon: "platform" },
  ],
};

const accountSection: ShellNavSection = {
  title: "Account",
  description: "Profile and preferences",
  items: [
    { href: "/app/account/profile", label: "Profile", hint: "Identity and billing profile", icon: "account" },
    { href: "/app/account/settings", label: "Settings", hint: "Notifications and contact preferences", icon: "account" },
  ],
};

const adminSection: ShellNavSection = {
  title: "Admin",
  description: "Role-gated operations",
  items: [
    { href: "/app/admin/control-overview", label: "Control overview", hint: "Operator command center", icon: "platform" },
    { href: "/app/admin/tenant-control", label: "Tenant control", hint: "Cross-tenant lifecycle actions", icon: "tenants" },
    { href: "/app/admin/jobs", label: "Jobs", hint: "Cross-tenant job operations", icon: "platform" },
    { href: "/app/admin/audit", label: "Audit", hint: "Governance and change history", icon: "platform" },
    { href: "/app/admin/support-tools", label: "Support tools", hint: "Escalation tooling", icon: "support" },
    { href: "/app/admin/recovery", label: "Recovery", hint: "Dead-letter and remediation", icon: "platform" },
    { href: "/app/admin/billing-ops", label: "Billing ops", hint: "Dunning and payment interventions", icon: "billing" },
    { href: "/app/admin/platform-health", label: "Platform health", hint: "Privileged reliability view", icon: "platform" },
  ],
};

export function buildAppNavSections(canSeeAdmin: boolean): ShellNavSection[] {
  return [overviewSection, tenantsSection, billingSection, supportSection, platformSection, accountSection, ...(canSeeAdmin ? [adminSection] : [])];
}
