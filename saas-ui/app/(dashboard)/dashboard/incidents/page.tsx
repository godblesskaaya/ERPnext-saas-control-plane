"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardIncidentsPage() {
  return (
    <WorkspaceQueuePage
      title="Failed & blocked workspaces"
      description="Track failed provisioning, suspensions, and blocked accounts that need operator intervention."
      statusFilter={["failed", "suspended", "suspended_admin", "suspended_billing"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Resolve failures and suspensions quickly to restore access for affected customers."
    />
  );
}
