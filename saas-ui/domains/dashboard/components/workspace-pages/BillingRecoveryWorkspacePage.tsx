"use client";

import { WorkspaceQueuePage } from "../WorkspaceQueuePage";

export function BillingRecoveryWorkspacePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Billing recovery"
      description="Work dunning, retry, and overdue payment queues without leaving the dashboard journey."
      statusFilter={["pending_payment", "suspended_billing"]}
      billingFilter={["failed", "past_due", "unpaid", "cancelled"]}
      billingFilterMode="or"
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter={false}
      attentionNote="Prioritize past-due and failed payments before they turn into service suspensions."
      callout={{
        title: "Collections focus",
        body: "Use this queue to target overdue invoices and coordinate retries by payment channel.",
        tone: "default",
      }}
      handoffLinks={[
        { label: "Billing details", href: "/app/billing/invoices" },
        { label: "Suspensions", href: "/app/tenants/suspensions" },
      ]}
      emptyStateTitle="No billing recovery backlog"
      emptyStateBody="No pending payment follow-ups are currently in the queue."
      emptyStateActionLabel="Open billing portal"
      emptyStateActionHref="/billing"
    />
  );
}
