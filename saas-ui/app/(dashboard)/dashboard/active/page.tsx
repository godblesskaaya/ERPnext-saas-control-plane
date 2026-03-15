"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardActivePage() {
  return (
    <WorkspaceQueuePage
      title="Active tenants"
      description="Monitor live tenants and run routine operations like backups, plan changes, and admin resets."
      statusFilter={["active"]}
      showMetrics
      showAttention={false}
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Focus on uptime, backups, and customer growth for active workspaces."
      emptyStateTitle="No active tenants yet"
      emptyStateBody="Once provisioning is complete, live tenants will appear here for routine operations."
      emptyStateActionLabel="Review onboarding queue"
      emptyStateActionHref="/dashboard/onboarding"
    />
  );
}
