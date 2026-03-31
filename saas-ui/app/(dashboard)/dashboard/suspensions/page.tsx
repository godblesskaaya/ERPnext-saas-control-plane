"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardSuspensionsQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Suspensions queue"
      description="Review suspended workspaces and coordinate reactivation with billing or support owners."
      statusFilter={["suspended", "suspended_admin", "suspended_billing"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Verify suspension reason and next action for each impacted customer."
      callout={{
        title: "Reactivation checklist",
        body: "Confirm payment state, support notes, and customer acknowledgement before restoring access.",
        tone: "warn",
      }}
      handoffLinks={[
        { label: "Billing recovery", href: "/dashboard/billing-recovery" },
        { label: "Support", href: "/dashboard/support" },
      ]}
      emptyStateTitle="No suspended workspaces"
      emptyStateBody="No customer workspaces are currently suspended."
      emptyStateActionLabel="Go to billing recovery"
      emptyStateActionHref="/dashboard/billing-recovery"
    />
  );
}
