"use client";

import { Alert } from "@mui/material";
import { useParams } from "next/navigation";
import {
  TenantSubscriptionSection,
} from "../../../../../../domains/tenant-ops/ui/tenant-detail/sections";
import { TenantWorkspacePageLayout } from "../../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import {
  useTenantRouteContext,
  useTenantSubscriptionData,
} from "../../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantBillingPage() {
  const params = useParams<{ tenantId: string }>();
  const id = params.tenantId;
  const { tenant, error } = useTenantRouteContext(id);
  const { subscription, subscriptionSupported, subscriptionError, loadSubscription } = useTenantSubscriptionData(id);

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Billing & subscription"
      tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
      footerError={error}
    >
      <TenantSubscriptionSection
        subscriptionError={subscriptionError}
        subscriptionSupported={subscriptionSupported}
        subscription={subscription}
        onRefresh={() => {
          void loadSubscription();
        }}
        formatTimestamp={formatTimestamp}
      />
    </TenantWorkspacePageLayout>
  );
}
