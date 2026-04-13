"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardRegistryPage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Workspace registry"
      description="You are in Dashboard → Workspace registry. Search all customer workspaces, confirm status, then route each case to the right flow."
      showCreate
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter
      attentionNote="Use registry search to find the workspace quickly, then continue in the owning queue."
      callout={{
        title: "What to do next",
        body: "After locating a workspace, open provisioning, incidents, support, or billing recovery based on current status.",
        tone: "default",
      }}
      handoffLinks={[
        { label: "Provisioning", href: "/dashboard/provisioning" },
        { label: "Incidents", href: "/dashboard/incidents" },
        { label: "Support", href: "/dashboard/support" },
        { label: "Billing recovery", href: "/dashboard/billing-recovery" },
      ]}
    />
  );
}
