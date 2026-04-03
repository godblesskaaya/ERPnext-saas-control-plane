"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardProvisioningQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Provisioning queue"
      description="You are in Dashboard → Provisioning. Focus on setup, upgrade, and restore blockers so new workspaces can go live quickly."
      statusFilter={["pending", "provisioning", "upgrading", "restoring"]}
      showMetrics
      showAttention
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Prioritize blocked provisioning jobs first, then confirm each workspace has a clear next owner."
      callout={{
        title: "What to do next",
        body: "Review stalled tenants, retry or escalate quickly, then hand off unresolved failures to the incidents queue.",
        tone: "default",
      }}
      handoffLinks={[
        { label: "Onboarding", href: "/dashboard/onboarding" },
        { label: "Incidents", href: "/dashboard/incidents" },
      ]}
      emptyStateTitle="No provisioning workspaces in progress"
      emptyStateBody="Current setup and upgrade tasks are clear."
      emptyStateActionLabel="Review active tenants"
      emptyStateActionHref="/dashboard/active"
    />
  );
}
