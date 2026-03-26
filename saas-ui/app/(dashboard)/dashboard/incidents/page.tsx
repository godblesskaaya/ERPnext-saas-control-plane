"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardIncidentsQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Incident queue"
      description="Failed or degraded workspaces requiring immediate customer-facing follow-up."
      statusFilter={["failed"]}
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Resolve failed workspaces first to reduce downtime and support pressure."
      callout={{
        title: "Fast-path recovery",
        body: "Capture owner + next action on each failed workspace, then coordinate support updates.",
        tone: "warn",
      }}
      handoffLinks={[
        { label: "Suspensions", href: "/dashboard/suspensions" },
        { label: "Support", href: "/dashboard/support" },
      ]}
      emptyStateTitle="No incident workspaces"
      emptyStateBody="There are no failed workspaces in this queue right now."
      emptyStateActionLabel="Back to provisioning"
      emptyStateActionHref="/dashboard/provisioning"
    />
  );
}
