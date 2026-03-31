"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardSupportQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Support escalations"
      description="Customer escalation queue spanning failed, suspended, and payment-risk workspaces."
      statusFilter={["failed", "suspended", "suspended_admin", "suspended_billing"]}
      billingFilter={["failed", "past_due", "unpaid"]}
      billingFilterMode="or"
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Keep a clear owner and next update time on every open customer escalation."
      handoffLinks={[
        { label: "Incidents", href: "/dashboard/incidents" },
        { label: "Suspensions", href: "/dashboard/suspensions" },
        { label: "Billing recovery", href: "/dashboard/billing-recovery" },
      ]}
      callout={{
        title: "Customer communication",
        body: "Record contact channel and ETA so account teams can keep each customer informed.",
        tone: "warn",
      }}
      emptyStateTitle="No open support escalations"
      emptyStateBody="There are no failed or suspended workspace escalations requiring follow-up right now."
      emptyStateActionLabel="Open overview"
      emptyStateActionHref="/dashboard/overview"
    />
  );
}
