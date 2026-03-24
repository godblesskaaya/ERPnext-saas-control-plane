"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardIncidentsPage() {
  return (
    <WorkspaceQueuePage
      routeScope="admin"
      title="Failed & blocked workspaces"
      description="System failures that need operator intervention."
      statusFilter={["failed"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Resolve provisioning failures quickly to restore access for affected customers."
      emptyStateTitle="No failed or suspended workspaces"
      emptyStateBody="There are no failed tenants in the incident queue."
      emptyStateActionLabel="Review suspensions"
      emptyStateActionHref="/admin/suspensions"
    />
  );
}
