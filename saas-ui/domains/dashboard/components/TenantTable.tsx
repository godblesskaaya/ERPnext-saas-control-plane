"use client";

import { memo, useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import type { Job, Tenant } from "../../shared/lib/types";
import { EmptyState } from "../../shell/components";
import { TenantStatusChip } from "../../shared/components/TenantStatusChip";
import { formatTimestamp, getPlanChip, getTenantRowToneSx, getTenantStatusHint } from "../../shared/lib/tenantDisplayUtils";

type Props = {
  routeScope?: "workspace" | "admin";
  tenants: Tenant[];
  jobsByTenant: Record<string, Job | undefined>;
  onResumeCheckout?: (id: string) => Promise<void>;
  resumingCheckoutTenantId?: string | null;
  paymentCenterHref?: string;
  paymentCenterLabel?: string;
  onJobUpdate?: (job: Job) => void;
  onRetryProvisioning?: (id: string) => Promise<void>;
  retryingTenantId?: string | null;
  emptyStateTitle?: string;
  emptyStateBody?: string;
  emptyStateActionLabel?: string;
  emptyStateActionHref?: string;
  filterLabel?: string;
  showPaymentChannel?: boolean;
};

function getBillingLabel(tenant: Tenant): string {
  if (tenant.billing_status?.trim()) return tenant.billing_status;
  if (tenant.platform_customer_id) return "platform_customer_linked";
  if (tenant.payment_provider && tenant.payment_provider !== "stripe") return tenant.payment_provider;
  if (tenant.stripe_subscription_id) return "subscribed";
  if (tenant.stripe_checkout_session_id) return "checkout_created";
  return "n/a";
}

const PAYMENT_ACTION_STATUSES = new Set(["pending", "pending_payment", "suspended_billing"]);

function TenantTableComponent({
  routeScope = "workspace",
  tenants,
  jobsByTenant,
  onResumeCheckout,
  resumingCheckoutTenantId,
  paymentCenterHref = "/app/billing/invoices",
  paymentCenterLabel = "Open ERPNext billing",
  onRetryProvisioning,
  retryingTenantId,
  emptyStateTitle,
  emptyStateBody,
  emptyStateActionLabel,
  emptyStateActionHref,
  filterLabel,
  showPaymentChannel = false,
}: Props) {
  const isAdminScope = routeScope === "admin";

  const failedCount = useMemo(() => tenants.filter((tenant) => tenant.status.toLowerCase() === "failed").length, [tenants]);
  const setupCount = useMemo(
    () =>
      tenants.filter((tenant) =>
        ["pending", "pending_payment", "provisioning", "upgrading", "restoring", "pending_deletion"].includes(
          tenant.status.toLowerCase()
        )
      ).length,
    [tenants]
  );
  const liveCount = useMemo(() => tenants.filter((tenant) => tenant.status.toLowerCase() === "active").length, [tenants]);
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tenants.forEach((tenant) => {
      const channel = tenant.payment_channel ?? "unknown";
      counts[channel] = (counts[channel] ?? 0) + 1;
    });
    return counts;
  }, [tenants]);

  const renderPaymentActions = (tenant: Tenant) => {
    const normalizedStatus = tenant.status.toLowerCase();
    if (!PAYMENT_ACTION_STATUSES.has(normalizedStatus)) return null;

    return (
      <>
        {onResumeCheckout && ["pending", "pending_payment"].includes(normalizedStatus) ? (
          <Button
            size="small"
            variant="outlined"
            disabled={resumingCheckoutTenantId === tenant.id}
            onClick={() => void onResumeCheckout(tenant.id)}
            sx={{ borderRadius: 999 }}
          >
            {resumingCheckoutTenantId === tenant.id ? "Opening..." : "Resume checkout"}
          </Button>
        ) : null}
        <Button component={Link} href={paymentCenterHref} size="small" variant="outlined" sx={{ borderRadius: 999 }}>
          {paymentCenterLabel}
        </Button>
        <Button component={Link} href={`/app/tenants/${tenant.id}/billing`} size="small" variant="outlined" sx={{ borderRadius: 999 }}>
          Open tenant billing
        </Button>
      </>
    );
  };

  if (!tenants.length) {
    const title = emptyStateTitle ?? "No workspaces yet";
    const body = emptyStateBody ?? "Create your first workspace to start onboarding and daily operations.";

    return (
      <EmptyState
        title={title}
        description={body}
        action={
          (emptyStateActionHref ?? "#create-tenant") ? (
            <Button
              component="a"
              href={emptyStateActionHref ?? "#create-tenant"}
              variant="contained"
              sx={{ borderRadius: 999, bgcolor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }}
            >
              {emptyStateActionLabel ?? "Create first workspace"}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {filterLabel ? <Alert severity="warning" sx={{ borderRadius: 2 }}>{filterLabel}</Alert> : null}

      {showPaymentChannel ? (
        <Card variant="outlined">
          <CardContent sx={{ py: "10px !important" }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {Object.entries(channelCounts).map(([channel, count]) => (
                <Chip key={channel} size="small" variant="outlined" label={`${channel.replace(/_/g, " ")}: ${count}`} />
              ))}
            </Box>
          </CardContent>
        </Card>
      ) : null}

      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
        <MetricCard color="#065f46" bg="#ecfdf5" border="#86efac" label="Live environments" value={liveCount} />
        <MetricCard color="#92400e" bg="#fffbeb" border="#fcd34d" label="In setup flow" value={setupCount} />
        <MetricCard color="#b91c1c" bg="#fef2f2" border="#fca5a5" label="Need intervention" value={failedCount} />
      </Box>

      <Alert severity="info" sx={{ borderRadius: 3 }}>
        Heavy workspace actions now live in tenant details. Use <strong>Details</strong> for backups, plan changes, credential resets,
        and deletion.
      </Alert>

      <Box sx={{ display: { xs: "grid", md: "none" }, gap: 1.5 }}>
        {tenants.map((tenant) => (
          <TenantMobileCard
            key={tenant.id}
            tenant={tenant}
            job={jobsByTenant[tenant.id]}
            isAdminScope={isAdminScope}
            showPaymentChannel={showPaymentChannel}
            renderPaymentActions={renderPaymentActions}
          />
        ))}
      </Box>

      <TableContainer component={Card} variant="outlined" sx={{ borderRadius: 3, display: { xs: "none", md: "block" } }}>
        <Table size="small" sx={{ minWidth: 960 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: "rgba(37,99,235,0.06)" }}>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Workspace</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Package / focus</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Health</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Billing</TableCell>
              {showPaymentChannel ? <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Channel</TableCell> : null}
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Created</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Quick actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenants.map((tenant) => (
              <TenantTableRow
                key={tenant.id}
                tenant={tenant}
                job={jobsByTenant[tenant.id]}
                isAdminScope={isAdminScope}
                showPaymentChannel={showPaymentChannel}
                renderPaymentActions={renderPaymentActions}
                onRetryProvisioning={onRetryProvisioning}
                retryingTenantId={retryingTenantId}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function MetricCard({ label, value, color, bg, border }: { label: string; value: number; color: string; bg: string; border: string }) {
  return (
    <Card variant="outlined" sx={{ bgcolor: bg, borderColor: border }}>
      <CardContent sx={{ py: "10px !important" }}>
        <Typography variant="body2" color={color}>
          {label}: <Box component="span" sx={{ fontWeight: 700 }}>{value}</Box>
        </Typography>
      </CardContent>
    </Card>
  );
}

function TenantMobileCard({
  tenant,
  job,
  isAdminScope,
  showPaymentChannel,
  renderPaymentActions,
}: {
  tenant: Tenant;
  job: Job | undefined;
  isAdminScope: boolean;
  showPaymentChannel: boolean;
  renderPaymentActions: (tenant: Tenant) => ReactNode;
}) {
  const plan = getPlanChip(tenant.plan);
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, bgcolor: getTenantRowToneSx(tenant.status) ?? "background.paper" }}>
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          <TenantIdentity tenant={tenant} />
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Chip size="small" label={plan.label} color={plan.color} sx={plan.sx} />
            <TenantStatusChip status={tenant.status} />
          </Box>
          <TenantMeta tenant={tenant} job={job} isAdminScope={isAdminScope} showPaymentChannel={showPaymentChannel} />
          <TenantActions tenant={tenant} renderPaymentActions={renderPaymentActions} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function TenantIdentity({ tenant }: { tenant: Tenant }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{tenant.company_name}</Typography>
      <Typography variant="caption" color="text.secondary" display="block">{tenant.subdomain}</Typography>
      <Button component="a" href={`https://${tenant.domain}`} target="_blank" rel="noreferrer" size="small" sx={{ textTransform: "none", p: 0, minWidth: 0, mt: 0.5 }}>
        {tenant.domain}
      </Button>
    </Box>
  );
}

function TenantMeta({ tenant, job, isAdminScope, showPaymentChannel }: { tenant: Tenant; job: Job | undefined; isAdminScope: boolean; showPaymentChannel: boolean }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">Focus: <Box component="span" sx={{ color: "text.primary" }}>{tenant.chosen_app || "auto"}</Box></Typography>
      <Typography variant="caption" color="text.secondary">Billing: <Box component="span" sx={{ color: "text.primary" }}>{getBillingLabel(tenant)}</Box></Typography>
      {showPaymentChannel ? <Typography variant="caption" color="text.secondary">Channel: <Box component="span" sx={{ color: "text.primary" }}>{tenant.payment_channel ? tenant.payment_channel.replace(/_/g, " ") : "—"}</Box></Typography> : null}
      <Typography variant="caption" color="text.secondary">Created: <Box component="span" sx={{ color: "text.primary" }}>{formatTimestamp(tenant.created_at)}</Box></Typography>
      <Typography variant="caption" color="text.secondary">Health: <Box component="span" sx={{ color: "text.primary" }}>{getTenantStatusHint(tenant.status, isAdminScope)}</Box></Typography>
      {job ? <Typography variant="caption" color="text.secondary">Job: <Box component="span" sx={{ color: "text.primary" }}>{job.status}</Box></Typography> : null}
    </Stack>
  );
}

function TenantActions({ tenant, renderPaymentActions }: { tenant: Tenant; renderPaymentActions: (tenant: Tenant) => ReactNode }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      <Button component={Link} href={`/app/tenants/${tenant.id}/overview`} size="small" variant="outlined" sx={{ borderRadius: 999 }}>Details</Button>
      <Button component={Link} href={`/app/tenants/${tenant.id}/jobs`} size="small" variant="outlined" sx={{ borderRadius: 999 }}>Jobs</Button>
      <Button component={Link} href={`/app/tenants/${tenant.id}/backups`} size="small" variant="outlined" sx={{ borderRadius: 999 }}>Backups</Button>
      {renderPaymentActions(tenant)}
    </Box>
  );
}

const TenantTableRow = memo(function TenantTableRow({
  tenant,
  job,
  isAdminScope,
  showPaymentChannel,
  renderPaymentActions,
  onRetryProvisioning,
  retryingTenantId,
}: {
  tenant: Tenant;
  job: Job | undefined;
  isAdminScope: boolean;
  showPaymentChannel: boolean;
  renderPaymentActions: (tenant: Tenant) => ReactNode;
  onRetryProvisioning?: (id: string) => Promise<void>;
  retryingTenantId?: string | null;
}) {
  const plan = getPlanChip(tenant.plan);
  return (
    <TableRow hover sx={{ verticalAlign: "top", bgcolor: getTenantRowToneSx(tenant.status) }}>
      <TableCell><TenantIdentity tenant={tenant} /></TableCell>
      <TableCell>
        <Box sx={{ display: "grid", gap: 0.5 }}>
          <Chip size="small" label={plan.label} color={plan.color} sx={{ width: "fit-content", ...plan.sx }} />
          <Typography variant="caption" color="text.secondary">Focus: <Box component="span" sx={{ color: "text.primary" }}>{tenant.chosen_app || "auto"}</Box></Typography>
          {tenant.payment_provider ? <Typography variant="caption" color="text.secondary">Provider: {tenant.payment_provider}</Typography> : null}
        </Box>
      </TableCell>
      <TableCell>
        <TenantStatusChip status={tenant.status} />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>{getTenantStatusHint(tenant.status, isAdminScope)}</Typography>
        {job ? <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>Job: {job.status}</Typography> : null}
        {tenant.status.toLowerCase() === "failed" && onRetryProvisioning ? (
          <Button size="small" variant="outlined" disabled={retryingTenantId === tenant.id} onClick={() => void onRetryProvisioning(tenant.id)} sx={{ mt: 1, borderRadius: 999 }}>
            {retryingTenantId === tenant.id ? "Retrying..." : "Retry"}
          </Button>
        ) : null}
      </TableCell>
      <TableCell><Typography variant="caption" color="text.secondary">{getBillingLabel(tenant)}</Typography></TableCell>
      {showPaymentChannel ? <TableCell><Typography variant="caption" color="text.secondary">{tenant.payment_channel ? tenant.payment_channel.replace(/_/g, " ") : "—"}</Typography></TableCell> : null}
      <TableCell><Typography variant="caption" color="text.secondary">{formatTimestamp(tenant.created_at)}</Typography></TableCell>
      <TableCell><TenantActions tenant={tenant} renderPaymentActions={renderPaymentActions} /></TableCell>
    </TableRow>
  );
});

export const TenantTable = memo(TenantTableComponent);
