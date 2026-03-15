"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardOverviewPage() {
  return (
    <WorkspaceQueuePage
      title="Operations overview"
      description="Track onboarding, provisioning, and live operations for Tanzania teams in one command view."
      showCreate
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter
    />
  );
}
