"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardProvisioningQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Provisioning queue"
      description="Monitor workspaces in setup, upgrade, or restore so rollout blockers are resolved quickly."
      statusFilter={["pending", "provisioning", "upgrading", "restoring"]}
      showMetrics
      showAttention
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Prioritize provisioning blockers to keep onboarding momentum."
      callout={{
        title: "Provisioning triage",
        body: "Use this queue to follow in-flight provisioning and react when a workspace stalls or fails.",
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
