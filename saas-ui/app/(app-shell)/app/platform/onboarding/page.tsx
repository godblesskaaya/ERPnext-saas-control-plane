"use client";

import { WorkspaceQueuePage } from "../../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardOnboardingQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Onboarding payments"
      description="You are in Dashboard → Onboarding. Track sign-ups waiting for payment so provisioning can start without delay."
      statusFilter={["pending_payment"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Clear pending payments quickly, then hand each paid tenant to provisioning with clear ownership."
      callout={{
        title: "What to do next",
        body: "Confirm payment status, contact customers missing payment details, then move ready tenants into provisioning.",
        tone: "warn",
      }}
      emptyStateTitle="No pending onboarding payments"
      emptyStateBody="All onboarding tenants have either paid or moved to provisioning."
      emptyStateActionLabel="Open provisioning queue"
      emptyStateActionHref="/app/platform/provisioning"
    />
  );
}
