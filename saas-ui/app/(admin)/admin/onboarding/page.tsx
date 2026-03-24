"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardOnboardingPage() {
  return (
    <WorkspaceQueuePage
      routeScope="admin"
      title="Payment confirmation"
      description="Confirm mobile money and card payments before provisioning starts."
      statusFilter={["pending_payment"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Prioritize pending payments so new businesses can go live."
      emptyStateTitle="No pending payment workspaces right now"
      emptyStateBody="All sign-ups have either paid or moved into provisioning."
      emptyStateActionLabel="View provisioning queue"
      emptyStateActionHref="/admin/provisioning"
    />
  );
}
