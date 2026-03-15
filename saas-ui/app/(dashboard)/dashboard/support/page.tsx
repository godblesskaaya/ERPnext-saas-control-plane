"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardSupportPage() {
  return (
    <WorkspaceQueuePage
      title="Support workspace queue"
      description="Use this queue to triage customer incidents, billing disputes, and operational escalations."
      statusFilter={["failed", "suspended", "suspended_admin", "suspended_billing"]}
      showMetrics={false}
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Add support notes inside tenant detail pages to maintain context across handoffs."
      emptyStateTitle="No support escalations"
      emptyStateBody="There are no tenant incidents requiring support follow-up right now."
      emptyStateActionLabel="Review active tenants"
      emptyStateActionHref="/dashboard/active"
    />
  );
}
