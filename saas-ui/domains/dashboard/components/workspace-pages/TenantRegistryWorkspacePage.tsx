"use client";

import { WorkspaceQueuePage } from "../WorkspaceQueuePage";

export function TenantRegistryWorkspacePage() {
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
        { label: "Provisioning", href: "/app/platform/provisioning" },
        { label: "Incidents", href: "/app/platform/incidents" },
        { label: "Support", href: "/app/support/queue" },
        { label: "Billing recovery", href: "/app/billing/recovery" },
      ]}
    />
  );
}
