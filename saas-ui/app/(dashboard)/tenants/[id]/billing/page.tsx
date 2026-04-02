"use client";

import { Alert, Box, Stack, Typography } from "@mui/material";
import { useParams } from "next/navigation";
import {
  TenantSectionLinks,
  TenantSubscriptionSection,
} from "../../../../../domains/tenant-ops/ui/tenant-detail/sections";
import {
  useTenantRouteContext,
  useTenantSubscriptionData,
} from "../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantBillingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { tenant, error } = useTenantRouteContext(id);
  const { subscription, subscriptionSupported, subscriptionError, loadSubscription } = useTenantSubscriptionData(id);

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <Box sx={{ display: "grid", gap: 3, pb: 4 }}>
      <Stack spacing={0.5}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
          Billing & subscription
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
        </Typography>
      </Stack>

      <TenantSectionLinks tenantId={id} />

      <TenantSubscriptionSection
        subscriptionError={subscriptionError}
        subscriptionSupported={subscriptionSupported}
        subscription={subscription}
        onRefresh={() => {
          void loadSubscription();
        }}
        formatTimestamp={formatTimestamp}
      />

      {error ? <Alert severity="error">{error}</Alert> : null}
    </Box>
  );
}
