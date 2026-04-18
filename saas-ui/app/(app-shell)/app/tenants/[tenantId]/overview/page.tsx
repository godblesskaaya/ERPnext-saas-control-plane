"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import {
  renewTenantCheckout,
  retryTenantProvisioningAction,
  suspendTenantAccess,
  toTenantDetailErrorMessage,
  unsuspendTenantAccess,
} from "../../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { TenantWorkspacePageLayout } from "../../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import {
  useTenantCurrentUserData,
  useTenantRecentJobsData,
  useTenantRouteContext,
  useTenantSubscriptionData,
  useTenantSummaryData,
} from "../../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

function nextActionByStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "Workspace is live. Confirm users can log in and run first transactions.";
  if (normalized === "pending_payment") return "Complete payment to continue automatic provisioning.";
  if (normalized === "pending" || normalized === "provisioning") return "Provisioning is running. Keep this page open for status updates.";
  if (normalized === "upgrading") return "Upgrade in progress. Avoid configuration changes until it completes.";
  if (normalized === "restoring") return "Restore running. Monitor job logs for completion.";
  if (normalized === "pending_deletion") return "Deletion queued. Coordinate with support if this was unintentional.";
  if (normalized === "failed") return "Provisioning failed. Review related job logs and retry from dashboard.";
  if (normalized === "suspended_admin") return "Suspended by admin action. Contact support for reactivation.";
  if (normalized === "suspended_billing") return "Suspended for billing. Resolve payment to restore service.";
  if (normalized === "suspended") return "Access is suspended. Coordinate with admin team before reactivation.";
  return "Review tenant state and choose the next operational action.";
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatAmount(value?: number | null, currency = "TZS"): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

const PAYMENT_RECOVERY_STATUSES = new Set(["pending", "pending_payment", "suspended_billing"]);
const PAYMENT_RECOVERY_INVOICE_STATUSES = new Set(["open", "past_due", "unpaid", "uncollectible"]);
const PAYMENT_RECOVERY_SUBSCRIPTION_STATUSES = new Set(["pending", "past_due", "paused"]);

export default function TenantOverviewPage() {
  const params = useParams<{ tenantId: string }>();
  const id = params.tenantId;
  const { tenant, error, loadTenant } = useTenantRouteContext(id);
  const { currentUser } = useTenantCurrentUserData();
  const { recentJobs, recentJobsError, recentJobsSupported, refresh: refreshRecentJobs } = useTenantRecentJobsData(id, 40, 5);
  const { tenantSummary, tenantSummaryError } = useTenantSummaryData(id);
  const { subscription, subscriptionSupported, subscriptionError } = useTenantSubscriptionData(id);

  const [retrying, setRetrying] = useState(false);
  const [resumingCheckout, setResumingCheckout] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  const isAdmin = currentUser?.role === "admin";

  const retryProvisioning = useCallback(async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const result = await retryTenantProvisioningAction(id);
      if (!result.supported) {
        setActionError("Retry endpoint is not available on this backend.");
        return;
      }
      setActionNotice("Provisioning retry queued.");
      await loadTenant();
      await refreshRecentJobs();
    } catch (err) {
      setActionError(toTenantDetailErrorMessage(err, "Failed to retry provisioning"));
    } finally {
      setRetrying(false);
    }
  }, [id, loadTenant, refreshRecentJobs]);

  const activeRecentJob = useMemo(
    () => recentJobs.find((job) => !TERMINAL_JOB_STATUSES.has((job.status || "").toLowerCase())),
    [recentJobs]
  );
  const tenantStatus = (tenant?.status ?? "").toLowerCase();
  const subscriptionStatus = (subscription?.status ?? "").toLowerCase();
  const invoiceStatus = (tenantSummary?.last_invoice?.status ?? "").toLowerCase();
  const showPaymentRecovery = useMemo(
    () =>
      PAYMENT_RECOVERY_STATUSES.has(tenantStatus) ||
      PAYMENT_RECOVERY_SUBSCRIPTION_STATUSES.has(subscriptionStatus) ||
      PAYMENT_RECOVERY_INVOICE_STATUSES.has(invoiceStatus),
    [invoiceStatus, subscriptionStatus, tenantStatus]
  );

  const resumeCheckout = useCallback(async () => {
    if (!id) return;
    setResumingCheckout(true);
    setRecoveryError(null);
    setRecoveryNotice(null);
    try {
      const result = await renewTenantCheckout(id);
      if (!result.supported) {
        setRecoveryError("Checkout renewal is not available on this backend.");
        return;
      }
      if (result.data.checkout_url) {
        window.open(result.data.checkout_url, "_blank", "noopener,noreferrer");
        setRecoveryNotice("Checkout link opened in a new tab.");
      } else {
        setRecoveryNotice("Checkout link refreshed.");
      }
      await loadTenant();
    } catch (err) {
      setRecoveryError(toTenantDetailErrorMessage(err, "Unable to resume checkout."));
    } finally {
      setResumingCheckout(false);
    }
  }, [id, loadTenant]);

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  if (!tenant) {
    return <Typography color={error ? "error" : "text.secondary"}>{error ?? "Loading tenant..."}</Typography>;
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Overview"
      tenantContext={`${tenant.company_name} (${tenant.domain})`}
      footerError={error}
    >
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
          <Stack spacing={1}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "primary.main" }}>
              Tenant workspace
            </Typography>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
              {tenant.company_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Control-plane operational view for this customer workspace.
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            <Button
              component="a"
              href={`https://${tenant.domain}`}
              target="_blank"
              rel="noreferrer"
              variant="contained"
              size="small"
              sx={{ borderRadius: 99, px: 2, py: 1, textTransform: "none", fontWeight: 700, bgcolor: "primary.main" }}
            >
              Open workspace
            </Button>
            {tenant.status.toLowerCase() === "failed" ? (
              <Button
                variant="outlined"
                size="small"
                disabled={retrying}
                onClick={() => {
                  void retryProvisioning();
                }}
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
              >
                {retrying ? "Retrying..." : "Retry provisioning"}
              </Button>
            ) : null}
          </Stack>
        </Stack>

        <Box sx={{ mt: 3, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0,1fr))" } }}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                Status
              </Typography>
              <Chip label={tenant.status} size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                Plan
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                {tenant.plan ?? "—"}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                Primary domain
              </Typography>
              <Link
                href={`https://${tenant.domain}`}
                target="_blank"
                rel="noreferrer"
                underline="hover"
                sx={{ mt: 1, display: "inline-block", fontWeight: 700, color: "primary.main" }}
              >
                {tenant.domain}
              </Link>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                Payment channel
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                {tenant.payment_channel ?? "—"}
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Alert severity="warning" sx={{ mt: 3 }}>
          Next step: {nextActionByStatus(tenant.status)}
        </Alert>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Quick actions
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {showPaymentRecovery ? (
            <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "warning.light", bgcolor: "rgba(255,251,235,0.7)" }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Payment recovery
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Tenant status: {tenant.status} · Subscription: {subscription?.status ?? (subscriptionSupported ? "—" : "unsupported")} ·
                  Latest invoice: {tenantSummary?.last_invoice?.status ?? "—"}
                </Typography>
                {tenantSummary?.last_invoice ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Invoice due: {formatAmount(tenantSummary.last_invoice.amount_due, tenantSummary.last_invoice.currency ?? "TZS")}
                  </Typography>
                ) : null}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                  {["pending", "pending_payment"].includes(tenantStatus) ? (
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      disabled={resumingCheckout}
                      onClick={() => {
                        void resumeCheckout();
                      }}
                      sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                    >
                      {resumingCheckout ? "Opening checkout..." : "Resume checkout"}
                    </Button>
                  ) : null}
                  <Button component="a" href="/app/billing/invoices" variant="outlined" size="small" sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}>
                    Open payment center
                  </Button>
                  <Button component="a" href={`/app/tenants/${id}/billing`} variant="outlined" size="small" sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}>
                    Open tenant billing
                  </Button>
                </Stack>
                {subscriptionError ? <Typography variant="caption" color="error" sx={{ mt: 1, display: "block" }}>{subscriptionError}</Typography> : null}
                {recoveryNotice ? <Alert severity="success" sx={{ mt: 1 }}>{recoveryNotice}</Alert> : null}
                {recoveryError ? <Alert severity="error" sx={{ mt: 1 }}>{recoveryError}</Alert> : null}
              </CardContent>
            </Card>
          ) : null}

          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void navigator.clipboard.writeText(tenant.domain);
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700, width: "fit-content" }}
          >
            Copy domain
          </Button>

          {isAdmin ? (
            <>
              <TextField
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="Reason (optional)"
                size="small"
                fullWidth
              />
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button
                  variant="outlined"
                  color="error"
                  disabled={actionBusy}
                  onClick={async () => {
                    setActionBusy(true);
                    setActionError(null);
                    setActionNotice(null);
                    try {
                      const result = await suspendTenantAccess(tenant.id, actionReason.trim() || undefined);
                      if (!result.supported) {
                        setActionError("Suspend action is not enabled on this backend.");
                        return;
                      }
                      setActionNotice("Tenant suspended successfully.");
                      await loadTenant();
                    } catch (err) {
                      setActionError(toTenantDetailErrorMessage(err, "Failed to suspend tenant."));
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                >
                  Suspend tenant
                </Button>
                <Button
                  variant="outlined"
                  color="success"
                  disabled={actionBusy}
                  onClick={async () => {
                    setActionBusy(true);
                    setActionError(null);
                    setActionNotice(null);
                    try {
                      const result = await unsuspendTenantAccess(tenant.id, actionReason.trim() || undefined);
                      if (!result.supported) {
                        setActionError("Unsuspend action is not enabled on this backend.");
                        return;
                      }
                      setActionNotice("Tenant unsuspended successfully.");
                      await loadTenant();
                    } catch (err) {
                      setActionError(toTenantDetailErrorMessage(err, "Failed to unsuspend tenant."));
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                >
                  Unsuspend tenant
                </Button>
              </Stack>
            </>
          ) : (
            <Alert severity="info">Admin-only operational actions are hidden for your role.</Alert>
          )}

          {actionNotice ? <Alert severity="success">{actionNotice}</Alert> : null}
          {actionError ? <Alert severity="error">{actionError}</Alert> : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Recent operations
        </Typography>

        {tenantSummaryError ? <Alert severity="error" sx={{ mt: 2 }}>{tenantSummaryError}</Alert> : null}

        {recentJobsError ? (
          <Alert severity="error" sx={{ mt: 2 }}>{recentJobsError}</Alert>
        ) : !recentJobsSupported ? (
          <Alert severity="warning" sx={{ mt: 2 }}>Job history endpoint is not available on this backend.</Alert>
        ) : recentJobs.length ? (
          <Stack spacing={1} sx={{ mt: 2 }}>
            {recentJobs.map((job) => (
              <Paper key={job.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary" }}>{job.type}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {formatTimestamp(job.created_at)}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Status: {job.status}
                    {!TERMINAL_JOB_STATUSES.has((job.status || "").toLowerCase()) ? " · in progress" : ""}
                  </Typography>
                  <Button
                    component="a"
                    href={`/app/tenants/${id}/jobs?job=${job.id}`}
                    variant="outlined"
                    size="small"
                    sx={{ borderRadius: 99, textTransform: "none", py: 0 }}
                  >
                    View logs
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>No recent jobs yet.</Alert>
        )}

        <Card variant="outlined" sx={{ borderRadius: 3, mt: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
              Latest activity
            </Typography>
            {tenantSummary?.last_audit ? (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary", display: "block" }}>
                  {tenantSummary.last_audit.action}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {formatTimestamp(tenantSummary.last_audit.created_at)}
                </Typography>
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {activeRecentJob ? `Latest active job: ${activeRecentJob.type}` : "No activity logged yet."}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Paper>

    </TenantWorkspacePageLayout>
  );
}
