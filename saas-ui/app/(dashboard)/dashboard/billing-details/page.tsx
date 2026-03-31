"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardBillingDetailsQueuePage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Billing details"
      description="Invoice and payment-risk detail queue for channel-level billing follow-up."
      statusFilter={["pending_payment", "suspended_billing"]}
      billingFilter={["failed", "past_due", "unpaid", "cancelled"]}
      billingFilterMode="or"
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter
      callout={{
        title: "Invoice analytics lane",
        body: "Filter by billing status to isolate unpaid invoices and route customers to the right payment recovery path.",
        tone: "default",
      }}
      handoffLinks={[
        { label: "Billing recovery", href: "/dashboard/billing-recovery" },
        { label: "Payment center", href: "/billing" },
      ]}
      emptyStateTitle="No billing details requiring review"
      emptyStateBody="Invoice and payment status queues are currently healthy."
      emptyStateActionLabel="Back to billing recovery"
      emptyStateActionHref="/dashboard/billing-recovery"
    />
  );
}
