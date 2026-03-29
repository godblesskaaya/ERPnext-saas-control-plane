"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardActivePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Active tenants"
      description="Monitor live tenants and run routine workflows like backups, plan updates, and workspace health checks."
      statusFilter={["active"]}
      showMetrics
      showAttention={false}
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Focus on uptime, backups, and customer growth for active workspaces."
      emptyStateTitle="No active tenants yet"
      emptyStateBody="Once provisioning is complete, live tenants will appear here for routine workspace workflows."
      emptyStateActionLabel="Review onboarding queue"
      emptyStateActionHref="/onboarding"
    />
  );
}
