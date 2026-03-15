"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardActivityPage() {
  return (
    <WorkspaceQueuePage
      title="Jobs & activity"
      description="Review recent jobs, provisioning timelines, and operational actions across all tenants."
      showMetrics={false}
      showAttention={false}
      showBillingAlert={false}
      showStatusFilter={false}
      attentionNote="Use tenant detail pages for deep audit logs, team management, and support notes."
      emptyStateTitle="No recent jobs yet"
      emptyStateBody="Provisioning and backup jobs will surface here once scheduled."
      emptyStateActionLabel="Start onboarding"
      emptyStateActionHref="/dashboard/overview#create-tenant"
    />
  );
}
