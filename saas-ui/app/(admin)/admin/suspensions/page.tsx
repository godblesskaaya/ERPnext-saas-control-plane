"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardSuspensionsPage() {
  return (
    <WorkspaceQueuePage
      title="Account suspensions"
      description="Admin and billing suspensions requiring review or reactivation."
      statusFilter={["suspended", "suspended_admin", "suspended_billing"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Confirm suspension reasons and coordinate billing or admin reactivation."
      emptyStateTitle="No suspended workspaces"
      emptyStateBody="There are no suspended tenants waiting for review."
      emptyStateActionLabel="Review billing follow-ups"
      emptyStateActionHref="/dashboard/billing"
    />
  );
}
