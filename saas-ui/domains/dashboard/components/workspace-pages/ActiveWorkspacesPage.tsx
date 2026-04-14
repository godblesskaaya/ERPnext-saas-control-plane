"use client";

import { WorkspaceQueuePage } from "../WorkspaceQueuePage";

export function ActiveWorkspacesPage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Active workspaces"
      description="You are in Dashboard → Active workspaces. Keep healthy tenants stable and route exceptions to the right follow-up flow."
      statusFilter={["active"]}
      showMetrics
      showAttention={false}
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Focus on uptime, backups, and growth actions; move payment risk items into billing recovery."
      callout={{
        title: "What to do next",
        body: "Complete routine checks here, then hand off failed billing or provisioning regressions to their dedicated queues.",
        tone: "default",
      }}
      handoffLinks={[
        { label: "Billing recovery", href: "/app/billing/recovery" },
        { label: "Provisioning", href: "/app/platform/provisioning" },
        { label: "Support", href: "/app/support/queue" },
      ]}
      emptyStateTitle="No active workspaces yet"
      emptyStateBody="Once provisioning is complete, live workspaces will appear here for routine workflows."
      emptyStateActionLabel="Review onboarding queue"
      emptyStateActionHref="/onboarding"
    />
  );
}
