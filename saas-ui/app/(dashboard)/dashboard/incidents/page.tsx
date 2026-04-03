"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardIncidentsQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Incident queue"
      description="You are in Dashboard → Incidents. Use this queue for failed workspaces that need immediate recovery and customer communication."
      statusFilter={["failed"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Resolve failed workspaces first, then post a customer-safe update with owner and next checkpoint."
      callout={{
        title: "What to do next",
        body: "Assign owner, capture recovery step, and coordinate support updates before routing to suspension or billing flows.",
        tone: "warn",
      }}
      handoffLinks={[
        { label: "Suspensions", href: "/dashboard/suspensions" },
        { label: "Support", href: "/dashboard/support" },
        { label: "Billing recovery", href: "/dashboard/billing-recovery" },
      ]}
      emptyStateTitle="No incident workspaces"
      emptyStateBody="There are no failed workspaces in this queue right now."
      emptyStateActionLabel="Back to provisioning"
      emptyStateActionHref="/dashboard/provisioning"
    />
  );
}
