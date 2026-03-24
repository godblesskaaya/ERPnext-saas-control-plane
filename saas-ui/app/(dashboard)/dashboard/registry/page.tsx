"use client";

import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardRegistryPage() {
  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Tenant registry"
      description="Search and manage every customer workspace across the platform."
      showCreate
      showMetrics
      showAttention
      showBillingAlert
      showStatusFilter
    />
  );
}
