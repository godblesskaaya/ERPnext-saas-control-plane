"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardOnboardingQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Onboarding payments"
      description="Track sign-ups waiting for payment confirmation before provisioning begins."
      statusFilter={["pending_payment"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Clear pending payments quickly to unblock new workspace launches."
      callout={{
        title: "Payment handoff",
        body: "When payment is confirmed, continue in the provisioning queue to monitor activation progress.",
        tone: "warn",
      }}
      emptyStateTitle="No pending onboarding payments"
      emptyStateBody="All onboarding tenants have either paid or moved to provisioning."
      emptyStateActionLabel="Open provisioning queue"
      emptyStateActionHref="/dashboard/provisioning"
    />
  );
}
