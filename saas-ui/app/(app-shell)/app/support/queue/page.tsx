"use client";

import { WorkspaceQueuePage } from "../../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardSupportQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Support escalations queue"
      description="You are in Dashboard → Support. Use this queue to triage customer-impacting incidents first, then hand off billing and suspension follow-up."
      statusFilter={["failed", "suspended", "suspended_admin", "suspended_billing"]}
      billingFilter={["failed", "past_due", "unpaid"]}
      billingFilterMode="or"
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Set owner, next action, and customer update ETA for each escalation before handoff."
      handoffLinks={[
        { label: "Incidents", href: "/dashboard/incidents" },
        { label: "Suspensions", href: "/dashboard/suspensions" },
        { label: "Billing recovery", href: "/dashboard/billing-recovery" },
        { label: "Contact settings", href: "/dashboard/settings" },
      ]}
      callout={{
        title: "What to do next",
        body: "Start with failed workspaces, capture customer communication details, then route to incidents or billing recovery as needed.",
        tone: "warn",
      }}
      emptyStateTitle="No open support escalations"
      emptyStateBody="There are no failed or suspended workspace escalations requiring follow-up right now."
      emptyStateActionLabel="Open overview"
      emptyStateActionHref="/dashboard/overview"
    />
  );
}
