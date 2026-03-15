"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardOnboardingPage() {
  return (
    <WorkspaceQueuePage
      title="Onboarding & payments"
      description="Focus on workspaces still waiting for payment confirmation or provisioning completion."
      statusFilter={["pending_payment", "pending", "provisioning"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Prioritize pending payments and provisioning workspaces to complete go-live."
      emptyStateTitle="No onboarding workspaces right now"
      emptyStateBody="All current customers are either live or in a separate incident queue."
      emptyStateActionLabel="View active tenants"
      emptyStateActionHref="/dashboard/active"
    />
  );
}
