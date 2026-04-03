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
  { key: "overview", label: "Overview", href: "/dashboard/overview", icon: "overview" },
  { key: "tenants", label: "Tenants", href: "/dashboard/registry", icon: "tenants" },
  { key: "billing", label: "Billing", href: "/billing", icon: "billing" },
  { key: "support", label: "Support", href: "/dashboard/support", icon: "support" },
  { key: "platform", label: "Platform", href: "/dashboard/provisioning", icon: "platform" },
  { key: "account", label: "Account", href: "/dashboard/account", icon: "account" },
];

export const workspaceLocalNavByKey: Record<WorkspaceKey, ShellNavSection> = {
  overview: {
    title: "Overview workspace",
    description: "Snapshot, alerts, and activity.",
    items: [
      { href: "/dashboard/overview", label: "Overview", hint: "Workspace snapshot and priorities" },
      { href: "/dashboard/activity", label: "Recent activity", hint: "Latest workspace and lifecycle events" },
    ],
  },
  tenants: {
    title: "Tenants workspace",
    description: "Registry and lifecycle visibility.",
    items: [
      {
        href: "/dashboard/registry",
        label: "Registry",
        hint: "Search workspaces and open workspace details",
        match: ["/tenants"],
      },
      { href: "/dashboard/active", label: "Active", hint: "Live customer workspaces" },
      { href: "/dashboard/suspensions", label: "Suspended", hint: "Suspension states and actions" },
    ],
  },
  billing: {
    title: "Billing workspace",
    description: "Invoices, recovery, and payment state.",
    items: [
      { href: "/billing", label: "Payments", hint: "Resume checkout and review subscription invoices" },
      {
        href: "/dashboard/billing-recovery",
        label: "Recovery",
        hint: "Payment follow-ups and invoice recovery",
        match: ["/dashboard/billing-ops"],
      },
      { href: "/dashboard/billing-details", label: "Invoices", hint: "Invoice and provider-level breakdown" },
    ],
  },
  support: {
    title: "Support workspace",
    description: "Queue, escalation, and SLA readiness.",
    items: [
      { href: "/dashboard/support", label: "Queue", hint: "Customer support handoff and resolution tracking" },
      { href: "/dashboard/support-overview", label: "Escalations", hint: "Triage guidance and escalation checks" },
    ],
  },
  platform: {
    title: "Platform workspace",
    description: "Health, provisioning, and incidents.",
    items: [
      { href: "/dashboard/platform-health", label: "Health", hint: "Infrastructure, queue, and service checks" },
      { href: "/dashboard/provisioning", label: "Provisioning", hint: "Deployments and pending upgrades" },
      { href: "/dashboard/incidents", label: "Incidents", hint: "Provisioning failures and rescue actions" },
      { href: "/dashboard/onboarding", label: "Onboarding", hint: "Payment onboarding and activation readiness" },
    ],
  },
  account: {
    title: "Account workspace",
    description: "Profile and preferences.",
    items: [
      { href: "/dashboard/account", label: "Profile", hint: "Identity and billing profile" },
      { href: "/dashboard/settings", label: "Settings", hint: "Notification and contact preferences" },
    ],
  },
};

export const workspaceLocalNavSections: ShellNavSection[] = workspaceDescriptors.map(
  (workspace) => workspaceLocalNavByKey[workspace.key],
);
