"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardActivityPage() {
  return (
    <WorkspaceQueuePage
      title="Jobs & activity"
      description="Review recent jobs, provisioning timelines, and operational actions across all tenants."
      showMetrics={false}
      showAttention={false}
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Use tenant detail pages for deep audit logs, team management, and support notes."
    />
  );
}
