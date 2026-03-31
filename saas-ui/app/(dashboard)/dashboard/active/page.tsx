"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardActivePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Active workspaces"
      description="Monitor live workspaces and run routine workflows like backups, plan updates, and health checks."
      statusFilter={["active"]}
      showMetrics
      showAttention={false}
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Focus on uptime, backups, and customer growth for active workspaces."
      emptyStateTitle="No active workspaces yet"
      emptyStateBody="Once provisioning is complete, live workspaces will appear here for routine workflows."
      emptyStateActionLabel="Review onboarding queue"
      emptyStateActionHref="/onboarding"
    />
  );
}
