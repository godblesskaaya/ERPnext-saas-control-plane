import type { ShellNavSection } from "./nav";

export type WorkspaceKey = "overview" | "tenants" | "billing" | "support" | "platform" | "account";

export type WorkspaceDescriptor = {
  key: WorkspaceKey;
  label: string;
  href: string;
  description: string;
};

export const workspaceDescriptors: WorkspaceDescriptor[] = [
  { key: "overview", label: "Overview", href: "/dashboard/overview", description: "Global KPIs and action priorities." },
  { key: "tenants", label: "Tenants", href: "/dashboard/registry", description: "Tenant lifecycle and workspace registry." },
  { key: "billing", label: "Billing", href: "/billing", description: "Invoices, recovery, and payment visibility." },
  { key: "support", label: "Support", href: "/dashboard/support", description: "Support cases and escalation follow-up." },
  { key: "platform", label: "Platform", href: "/dashboard/provisioning", description: "Provisioning and reliability workflows." },
  { key: "account", label: "Account", href: "/dashboard/account", description: "Profile, notification, and user settings." },
];

export const workspaceLocalNavByKey: Record<WorkspaceKey, ShellNavSection> = {
  overview: {
    title: "Overview workspace",
    description: "Workspace snapshot, live activity, and customer-facing health signals.",
    items: [
      { href: "/dashboard/overview", label: "Overview", hint: "Workspace snapshot and priorities" },
      { href: "/dashboard/active", label: "Active workspaces", hint: "Live customers and workspace health" },
      { href: "/dashboard/activity", label: "Activity feed", hint: "Recent workspace lifecycle changes" },
    ],
  },
  tenants: {
    title: "Tenants workspace",
    description: "Find tenants, review status, and continue workspace detail journeys.",
    items: [
      {
        href: "/dashboard/registry",
        label: "Workspace registry",
        hint: "Search workspaces and open workspace details",
        match: ["/tenants"],
      },
    ],
  },
  billing: {
    title: "Billing workspace",
    description: "Customer payment recovery and invoice visibility.",
    items: [
      {
        href: "/dashboard/billing-recovery",
        label: "Billing recovery",
        hint: "Payment follow-ups and invoice recovery",
        match: ["/dashboard/billing-ops"],
      },
      { href: "/dashboard/billing-details", label: "Invoice analytics", hint: "Invoice and provider-level breakdown" },
      { href: "/billing", label: "Payment center", hint: "Resume checkout and review subscription invoices" },
    ],
  },
  support: {
    title: "Support workspace",
    description: "Support case routing, escalation readiness, and customer handoff.",
    items: [
      { href: "/dashboard/support", label: "Support queue", hint: "Customer support handoff and resolution tracking" },
      { href: "/dashboard/support-overview", label: "Support overview", hint: "Triage guidance and escalation checks" },
    ],
  },
  platform: {
    title: "Platform workspace",
    description: "Provisioning, incident recovery, onboarding flow, and suspension tracking.",
    items: [
      { href: "/dashboard/onboarding", label: "Onboarding queue", hint: "Payment onboarding and activation readiness" },
      { href: "/dashboard/provisioning", label: "Provisioning queue", hint: "Deployments and pending upgrades" },
      { href: "/dashboard/incidents", label: "Incidents queue", hint: "Provisioning failures and rescue actions" },
      { href: "/dashboard/suspensions", label: "Suspensions queue", hint: "Workspace and billing suspension status" },
    ],
  },
  account: {
    title: "Account workspace",
    description: "User profile, notification readiness, and account settings.",
    items: [
      { href: "/dashboard/account", label: "Account summary", hint: "Identity and billing profile" },
      { href: "/dashboard/settings", label: "Settings", hint: "Notification and contact preferences" },
    ],
  },
};

export const workspaceLocalNavSections: ShellNavSection[] = workspaceDescriptors.map(
  (workspace) => workspaceLocalNavByKey[workspace.key],
);
