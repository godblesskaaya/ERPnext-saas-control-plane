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
