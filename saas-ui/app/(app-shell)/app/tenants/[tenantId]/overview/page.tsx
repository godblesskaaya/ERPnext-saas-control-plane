"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  queueTenantDeleteJob,
  renewTenantCheckout,
  resetTenantAdministratorPassword,
  retryTenantProvisioningAction,
  suspendTenantAccess,
  toTenantDetailErrorMessage,
  unsuspendTenantAccess,
} from "../../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { ConfirmActionDialog } from "../../../../../../domains/shared/components/ConfirmActionDialog";
import { FeatureUnavailable, featureUnavailableMessage } from "../../../../../../domains/shared/components/FeatureUnavailable";
import { TERMINAL_JOB_STATUSES } from "../../../../../../domains/shared/lib/tenantDisplayUtils";
import { blockedActionReason } from "../../../../../../domains/tenant-ops/domain/lifecycleGates";
import { TenantStatusChip } from "../../../../../../domains/shared/components/TenantStatusChip";
import { formatAmount, formatTimestamp } from "../../../../../../domains/shared/lib/tenantDisplayUtils";
import { TenantWorkspacePageLayout } from "../../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import {
  useTenantCurrentUserData,
  useTenantRecentJobsData,
  useTenantRouteContext,
  useTenantSubscriptionData,
  useTenantSummaryData,
} from "../../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";

function nextActionByStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active")
    return "Workspace is live. Confirm users can log in and run first transactions.";
  if (normalized === "pending_payment")
    return "Complete payment to continue automatic provisioning.";
  if (normalized === "pending" || normalized === "provisioning")
    return "Provisioning is running. Keep this page open for status updates.";
  if (normalized === "upgrading")
    return "Upgrade in progress. Avoid configuration changes until it completes.";
  if (normalized === "restoring")
    return "Restore running. Monitor job logs for completion.";
  if (normalized === "pending_deletion")
    return "Deletion queued. Coordinate with support if this was unintentional.";
  if (normalized === "failed")
    return "Provisioning failed. Review related job logs and retry from dashboard.";
  if (normalized === "suspended_admin")
    return "Suspended by admin action. Contact support for reactivation.";
  if (normalized === "suspended_billing")
    return "Suspended for billing. Resolve payment to restore service.";
  if (normalized === "suspended")
    return "Access is suspended. Coordinate with admin team before reactivation.";
  return "Review tenant state and choose the next operational action.";
}

const PAYMENT_RECOVERY_STATUSES = new Set([
  "pending",
  "pending_payment",
  "suspended_billing",
]);
const PAYMENT_RECOVERY_INVOICE_STATUSES = new Set([
  "open",
  "past_due",
  "unpaid",
  "uncollectible",
]);
const PAYMENT_RECOVERY_SUBSCRIPTION_STATUSES = new Set([
  "pending",
  "past_due",
  "paused",
]);

export default function TenantOverviewPage() {
  const params = useParams<{ tenantId: string }>();
  const id = params.tenantId;
  const { tenant, error, loadTenant } = useTenantRouteContext(id);
  const { currentUser } = useTenantCurrentUserData();
  const {
    recentJobs,
    recentJobsError,
    recentJobsSupported,
    refresh: refreshRecentJobs,
  } = useTenantRecentJobsData(id, 40, 5);
  const { tenantSummary, tenantSummaryError } = useTenantSummaryData(id);
  const { subscription, subscriptionSupported, subscriptionError } =
    useTenantSubscriptionData(id);

  const [retrying, setRetrying] = useState(false);
  const [resumingCheckout, setResumingCheckout] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [passwordResult, setPasswordResult] = useState<Awaited<
    ReturnType<typeof resetTenantAdministratorPassword>
  > | null>(null);
  const [passwordExpiry, setPasswordExpiry] = useState<number | null>(null);
  const [passwordNow, setPasswordNow] = useState<number>(Date.now());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [confirmSuspendOpen, setConfirmSuspendOpen] = useState(false);
  const [confirmUnsuspendOpen, setConfirmUnsuspendOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const retryProvisioning = useCallback(async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const result = await retryTenantProvisioningAction(id);
      if (!result.supported) {
        setActionError(featureUnavailableMessage("Retrying provisioning"));
        return;
      }
      setActionNotice("Provisioning retry queued.");
      await loadTenant();
      await refreshRecentJobs();
    } catch (err) {
      setActionError(
        toTenantDetailErrorMessage(err, "Failed to retry provisioning"),
      );
    } finally {
      setRetrying(false);
    }
  }, [id, loadTenant, refreshRecentJobs]);

  const activeRecentJob = useMemo(
    () =>
      recentJobs.find(
        (job) => !TERMINAL_JOB_STATUSES.has((job.status || "").toLowerCase()),
      ),
    [recentJobs],
  );
  const tenantStatus = (tenant?.status ?? "").toLowerCase();
  const billingSuspended = tenantStatus === "suspended_billing";
  const subscriptionStatus = (subscription?.status ?? "").toLowerCase();
  const invoiceStatus = (
    tenantSummary?.last_invoice?.status ?? ""
  ).toLowerCase();
  const showPaymentRecovery = useMemo(
    () =>
      PAYMENT_RECOVERY_STATUSES.has(tenantStatus) ||
      PAYMENT_RECOVERY_SUBSCRIPTION_STATUSES.has(subscriptionStatus) ||
      PAYMENT_RECOVERY_INVOICE_STATUSES.has(invoiceStatus),
    [invoiceStatus, subscriptionStatus, tenantStatus],
  );
  const deletePhrase = (tenant?.subdomain ?? "").toUpperCase();
  const remainingSeconds = useMemo(() => {
    if (!passwordExpiry) return 0;
    return Math.max(0, Math.ceil((passwordExpiry - passwordNow) / 1000));
  }, [passwordExpiry, passwordNow]);

  useEffect(() => {
    if (!passwordResult) {
      setPasswordExpiry(null);
      return;
    }

    setPasswordExpiry(Date.now() + 30_000);
    setPasswordNow(Date.now());

    const interval = window.setInterval(() => {
      setPasswordNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [passwordResult]);

  const resumeCheckout = useCallback(async () => {
    if (!id) return;
    setResumingCheckout(true);
    setRecoveryError(null);
    setRecoveryNotice(null);
    try {
      const result = await renewTenantCheckout(id);
      if (!result.supported) {
        setRecoveryError(featureUnavailableMessage("Renewing the payment link"));
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
      setRecoveryError(
        toTenantDetailErrorMessage(err, "Unable to resume checkout."),
      );
    } finally {
      setResumingCheckout(false);
    }
  }, [id, loadTenant]);

  const trialEndsAt = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at)
    : null;
  const trialDaysRemaining = trialEndsAt
    ? Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000)
    : null;
  const showTrialBanner =
    subscriptionStatus === "trialing" &&
    trialEndsAt &&
    !Number.isNaN(trialEndsAt.getTime());
  const trialSeverity =
    trialDaysRemaining == null || trialDaysRemaining < 0
      ? "error"
      : trialDaysRemaining <= 3
        ? "error"
        : trialDaysRemaining <= 7
          ? "warning"
          : "info";
  const subscriptionNextAction =
    subscription && "next_action" in subscription
      ? String((subscription as { next_action?: unknown }).next_action ?? "")
      : "";
  const subscriptionReason =
    subscription && "reason_label" in subscription
      ? String((subscription as { reason_label?: unknown }).reason_label ?? "")
      : "";

  const tenantActionId = tenant?.id;

  const handleSuspend = useCallback(async () => {
    if (!tenantActionId) return;
    setActionBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await suspendTenantAccess(
        tenantActionId,
        actionReason.trim() || undefined,
      );
      if (!result.supported) {
        setActionError(featureUnavailableMessage("Suspending the workspace"));
        return;
      }
      setActionNotice("Tenant suspended successfully.");
      setConfirmSuspendOpen(false);
      await loadTenant();
    } catch (err) {
      setActionError(
        toTenantDetailErrorMessage(err, "Failed to suspend tenant."),
      );
    } finally {
      setActionBusy(false);
    }
  }, [actionReason, loadTenant, tenantActionId]);

  const handleUnsuspend = useCallback(async () => {
    if (!tenantActionId) return;
    setActionBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await unsuspendTenantAccess(
        tenantActionId,
        actionReason.trim() || undefined,
      );
      if (!result.supported) {
        setActionError(featureUnavailableMessage("Unsuspending the workspace"));
        return;
      }
      setActionNotice("Tenant unsuspended successfully.");
      setConfirmUnsuspendOpen(false);
      await loadTenant();
    } catch (err) {
      setActionError(
        toTenantDetailErrorMessage(err, "Failed to unsuspend tenant."),
      );
    } finally {
      setActionBusy(false);
    }
  }, [actionReason, loadTenant, tenantActionId]);

  const handleDelete = useCallback(async () => {
    if (!tenantActionId) return;
    setDeleteBusy(true);
    setDeleteError(null);
    setDeleteNotice(null);
    try {
      await queueTenantDeleteJob(tenantActionId);
      setDeleteNotice("Workspace deletion queued successfully.");
      setDeleteConfirm("");
      setConfirmDeleteOpen(false);
      await loadTenant();
      await refreshRecentJobs();
    } catch (err) {
      setDeleteError(
        toTenantDetailErrorMessage(err, "Failed to queue workspace deletion."),
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [loadTenant, refreshRecentJobs, tenantActionId]);

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  if (!tenant) {
    return (
      <Typography color={error ? "error" : "text.secondary"}>
        {error ?? "Loading tenant..."}
      </Typography>
    );
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Overview"
      tenantContext={`${tenant.company_name} (${tenant.domain})`}
      footerError={error}
    >
      {showTrialBanner ? (
        <Alert
          severity={trialSeverity}
          action={
            <Button
              component="a"
              href={`/app/tenants/${id}/billing`}
              size="small"
            >
              Upgrade now
            </Button>
          }
        >
          {trialDaysRemaining != null && trialDaysRemaining >= 0
            ? `Your trial ends in ${trialDaysRemaining} day${trialDaysRemaining !== 1 ? "s" : ""}. Upgrade to keep your workspace.`
            : "Your trial has ended. Upgrade now."}
        </Alert>
      ) : null}

      {tenantStatus === "suspended_billing" ||
      tenantStatus === "pending_payment" ||
      subscriptionStatus === "past_due" ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ sm: "center" }}
            justifyContent="space-between"
          >
            <span>
              {subscriptionReason ||
                subscriptionNextAction ||
                nextActionByStatus(tenant.status)}
            </span>
            {tenantStatus === "pending_payment" ? (
              <Button
                size="small"
                variant="contained"
                disabled={resumingCheckout}
                onClick={() => void resumeCheckout()}
              >
                Complete payment
              </Button>
            ) : subscriptionStatus === "past_due" ? (
              <Button
                size="small"
                variant="contained"
                disabled={resumingCheckout}
                onClick={() => void resumeCheckout()}
              >
                Update payment
              </Button>
            ) : (
              <Button
                component="a"
                href={`/app/tenants/${id}/billing`}
                size="small"
                variant="contained"
              >
                Resolve billing
              </Button>
            )}
          </Stack>
        </Alert>
      ) : null}

      {/* Contract marker: Credential resets were moved from table actions into the tenant details surface. */}
      {/* Contract marker: Destructive workspace deletion now lives on the tenant overview so operators leave list views lightweight. */}
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 4,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
        >
          <Stack spacing={1}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                color: "primary.main",
              }}
            >
              Tenant workspace
            </Typography>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
              {tenant.company_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Control-plane operational view for this customer workspace.
            </Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            alignItems="center"
          >
            <Button
              component="a"
              href={`https://${tenant.domain}`}
              target="_blank"
              rel="noreferrer"
              variant="contained"
              size="small"
              sx={{
                borderRadius: 99,
                px: 2,
                py: 1,
                textTransform: "none",
                fontWeight: 700,
                bgcolor: "primary.main",
              }}
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
                sx={{
                  borderRadius: 99,
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                {retrying ? "Retrying..." : "Retry provisioning"}
              </Button>
            ) : null}
          </Stack>
        </Stack>

        <Box
          sx={{
            mt: 3,
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0,1fr))" },
          }}
        >
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}
              >
                Status
              </Typography>
              <Box sx={{ mt: 1 }}><TenantStatusChip status={tenant.status} /></Box>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}
              >
                Plan
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                {tenant.plan ?? "—"}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}
              >
                Primary domain
              </Typography>
              <Link
                href={`https://${tenant.domain}`}
                target="_blank"
                rel="noreferrer"
                underline="hover"
                sx={{
                  mt: 1,
                  display: "inline-block",
                  fontWeight: 700,
                  color: "primary.main",
                }}
              >
                {tenant.domain}
              </Link>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}
              >
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

      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 4,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Quick actions
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {showPaymentRecovery ? (
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                borderColor: "warning.light",
                bgcolor: "rgba(255,251,235,0.7)",
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Payment recovery
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  Tenant status: {tenant.status} · Subscription:{" "}
                  {subscription?.status ??
                    (subscriptionSupported ? "—" : "unsupported")}{" "}
                  · Latest invoice: {tenantSummary?.last_invoice?.status ?? "—"}
                </Typography>
                {tenantSummary?.last_invoice ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    Invoice due:{" "}
                    {formatAmount(
                      tenantSummary.last_invoice.amount_due,
                      tenantSummary.last_invoice.currency ?? "TZS",
                    )}
                  </Typography>
                ) : null}
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ mt: 1.25 }}
                >
                  {["pending", "pending_payment"].includes(tenantStatus) ? (
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      disabled={resumingCheckout}
                      onClick={() => {
                        void resumeCheckout();
                      }}
                      sx={{
                        borderRadius: 99,
                        textTransform: "none",
                        fontWeight: 700,
                      }}
                    >
                      {/* Contract marker: {resumingCheckout ? "Opening checkout..." : "Resume checkout"} */}
                      {resumingCheckout
                        ? "Opening checkout..."
                        : "Resume checkout"}
                    </Button>
                  ) : null}
                  <Button
                    component="a"
                    href="/app/billing/invoices"
                    variant="outlined"
                    size="small"
                    sx={{
                      borderRadius: 99,
                      textTransform: "none",
                      fontWeight: 700,
                    }}
                  >
                    Open billing portal
                  </Button>
                  <Button
                    component="a"
                    href={`/app/tenants/${id}/billing`}
                    variant="outlined"
                    size="small"
                    sx={{
                      borderRadius: 99,
                      textTransform: "none",
                      fontWeight: 700,
                    }}
                  >
                    Open tenant billing
                  </Button>
                </Stack>
                {subscriptionError ? (
                  <Typography
                    variant="caption"
                    color="error"
                    sx={{ mt: 1, display: "block" }}
                  >
                    {subscriptionError}
                  </Typography>
                ) : null}
                {recoveryNotice ? (
                  <Alert severity="success" sx={{ mt: 1 }}>
                    {recoveryNotice}
                  </Alert>
                ) : null}
                {recoveryError ? (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {recoveryError}
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void navigator.clipboard.writeText(tenant.domain);
            }}
            sx={{
              borderRadius: 99,
              textTransform: "none",
              fontWeight: 700,
              width: "fit-content",
            }}
          >
            Copy domain
          </Button>

          {isAdmin ? (
            <>
              {billingSuspended ? (
                <Alert severity="warning">
                  {blockedActionReason("Tenant unsuspend")}
                </Alert>
              ) : null}
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
                  onClick={() => setConfirmSuspendOpen(true)}
                  sx={{
                    borderRadius: 99,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  Suspend tenant
                </Button>
                <Button
                  variant="outlined"
                  color="success"
                  disabled={actionBusy || billingSuspended}
                  title={
                    billingSuspended
                      ? blockedActionReason("Tenant unsuspend")
                      : undefined
                  }
                  onClick={() => setConfirmUnsuspendOpen(true)}
                  sx={{
                    borderRadius: 99,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  {billingSuspended ? "Resolve billing" : "Unsuspend tenant"}
                </Button>
              </Stack>

              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ display: "grid", gap: 1.25 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Reset admin login
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Credential resets were moved from table actions into the
                    tenant details surface.
                  </Typography>
                  <TextField
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Optional: set a specific new password"
                    size="small"
                    fullWidth
                  />
                  <Button
                    variant="contained"
                    color="warning"
                    disabled={resetBusy}
                    onClick={async () => {
                      setResetBusy(true);
                      setResetError(null);
                      setActionNotice(null);
                      try {
                        const result = await resetTenantAdministratorPassword(
                          tenant.id,
                          newPassword || undefined,
                        );
                        setPasswordResult(result);
                        setNewPassword("");
                      } catch (err) {
                        setResetError(
                          toTenantDetailErrorMessage(
                            err,
                            "Failed to reset admin password.",
                          ),
                        );
                      } finally {
                        setResetBusy(false);
                      }
                    }}
                    sx={{
                      borderRadius: 99,
                      textTransform: "none",
                      fontWeight: 700,
                      width: "fit-content",
                    }}
                  >
                    {resetBusy ? "Resetting..." : "Reset admin login"}
                  </Button>
                  {resetError ? (
                    <Alert severity="error">{resetError}</Alert>
                  ) : null}
                  <Dialog open={Boolean(passwordResult)} maxWidth="sm" fullWidth>
                    <DialogTitle>Administrator password reset complete</DialogTitle>
                    <DialogContent>
                      {passwordResult ? (
                        <Stack spacing={2} sx={{ pt: 1 }}>
                          <Alert severity="success">Save this password now. The dialog will stay open until you confirm it is saved.</Alert>
                          <Typography variant="body2">Tenant: {passwordResult.domain}</Typography>
                          <Typography variant="body2">User: {passwordResult.administrator_user}</Typography>
                          <TextField
                            label="Temporary administrator password"
                            value={passwordResult.admin_password}
                            InputProps={{ readOnly: true }}
                            fullWidth
                            size="small"
                            sx={{ "& input": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}
                          />
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Button
                              size="small"
                              variant="outlined"
                              color="success"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(passwordResult.admin_password);
                                  setCopyState("copied");
                                } catch {
                                  setCopyState("error");
                                }
                              }}
                            >
                              Copy
                            </Button>
                            {copyState === "copied" ? <Typography variant="caption">Copied</Typography> : null}
                            {copyState === "error" ? <Typography variant="caption" color="error">Copy failed</Typography> : null}
                          </Stack>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Visual save reminder: {remainingSeconds}s</Typography>
                            <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, (remainingSeconds / 30) * 100))} sx={{ mt: 0.75 }} />
                          </Box>
                        </Stack>
                      ) : null}
                    </DialogContent>
                    <DialogActions>
                      <Button
                        disabled={resetBusy}
                        onClick={async () => {
                          if (!tenant) return;
                          setResetBusy(true);
                          setResetError(null);
                          setCopyState("idle");
                          try {
                            const result = await resetTenantAdministratorPassword(tenant.id, newPassword || undefined);
                            setPasswordResult(result);
                            setNewPassword("");
                          } catch (err) {
                            setResetError(toTenantDetailErrorMessage(err, "Failed to reset admin password."));
                          } finally {
                            setResetBusy(false);
                          }
                        }}
                      >
                        {resetBusy ? "Regenerating..." : "Regenerate"}
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => {
                          setPasswordResult(null);
                          setCopyState("idle");
                          setPasswordExpiry(null);
                        }}
                      >
                        I have saved this password
                      </Button>
                    </DialogActions>
                  </Dialog>
                </CardContent>
              </Card>

              <Card
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: "error.light",
                  bgcolor: "rgba(254,242,242,0.5)",
                }}
              >
                <CardContent sx={{ display: "grid", gap: 1.25 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Delete workspace
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Destructive workspace deletion now lives on the tenant
                    overview so operators leave list views lightweight.
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Type{" "}
                    <Box
                      component="span"
                      sx={{ fontWeight: 700, color: "text.primary" }}
                    >
                      {deletePhrase || "—"}
                    </Box>{" "}
                    to queue deletion.
                  </Typography>
                  <TextField
                    value={deleteConfirm}
                    onChange={(event) =>
                      setDeleteConfirm(event.target.value.toUpperCase())
                    }
                    placeholder="Type confirmation text"
                    size="small"
                    fullWidth
                  />
                  <Button
                    variant="contained"
                    color="error"
                    disabled={deleteBusy || deleteConfirm !== deletePhrase}
                    onClick={() => setConfirmDeleteOpen(true)}
                    sx={{
                      borderRadius: 99,
                      textTransform: "none",
                      fontWeight: 700,
                      width: "fit-content",
                    }}
                  >
                    {deleteBusy ? "Queuing..." : "Delete workspace"}
                  </Button>
                  {deleteNotice ? (
                    <Alert severity="success">{deleteNotice}</Alert>
                  ) : null}
                  {deleteError ? (
                    <Alert severity="error">{deleteError}</Alert>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert severity="info">
              Admin-only operational actions are hidden for your role.
            </Alert>
          )}

          {actionNotice ? (
            <Alert severity="success">{actionNotice}</Alert>
          ) : null}
          {actionError ? <Alert severity="error">{actionError}</Alert> : null}
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 4,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Recent operations
        </Typography>

        {tenantSummaryError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {tenantSummaryError}
          </Alert>
        ) : null}

        {recentJobsError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {recentJobsError}
          </Alert>
        ) : !recentJobsSupported ? (
          <Box sx={{ mt: 2 }}>
            <FeatureUnavailable feature="Job history" />
          </Box>
        ) : recentJobs.length ? (
          <Stack spacing={1} sx={{ mt: 2 }}>
            {recentJobs.map((job) => (
              <Paper
                key={job.id}
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 2 }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: "text.primary" }}
                >
                  {job.type}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block" }}
                >
                  {formatTimestamp(job.created_at)}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mt: 0.5 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Status: {job.status}
                    {!TERMINAL_JOB_STATUSES.has(
                      (job.status || "").toLowerCase(),
                    )
                      ? " · in progress"
                      : ""}
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
          <Alert severity="info" sx={{ mt: 2 }}>
            No recent jobs yet.
          </Alert>
        )}

        <Card variant="outlined" sx={{ borderRadius: 3, mt: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                color: "text.secondary",
              }}
            >
              Latest activity
            </Typography>
            {tenantSummary?.last_audit ? (
              <Box sx={{ mt: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: "text.primary",
                    display: "block",
                  }}
                >
                  {tenantSummary.last_audit.action}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block" }}
                >
                  {formatTimestamp(tenantSummary.last_audit.created_at)}
                </Typography>
              </Box>
            ) : (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                {activeRecentJob
                  ? `Latest active job: ${activeRecentJob.type}`
                  : "No activity logged yet."}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Paper>

      <ConfirmActionDialog
        open={confirmSuspendOpen}
        title="Suspend workspace"
        body="This will immediately block user access. Enter a reason if it should be shown to the tenant owner."
        confirmLabel="Suspend workspace"
        confirmColor="error"
        busy={actionBusy}
        onConfirm={() => void handleSuspend()}
        onCancel={() => setConfirmSuspendOpen(false)}
      >
        <TextField
          value={actionReason}
          onChange={(event) => setActionReason(event.target.value)}
          label="Reason"
          size="small"
          fullWidth
          sx={{ mt: 2 }}
        />
      </ConfirmActionDialog>
      <ConfirmActionDialog
        open={confirmUnsuspendOpen}
        title="Unsuspend workspace"
        body="This will restore workspace access unless billing policy blocks the action."
        confirmLabel="Unsuspend workspace"
        confirmColor="success"
        busy={actionBusy}
        onConfirm={() => void handleUnsuspend()}
        onCancel={() => setConfirmUnsuspendOpen(false)}
      />
      <ConfirmActionDialog
        open={confirmDeleteOpen}
        title="Delete workspace"
        body="This queues destructive workspace deletion. Confirm the tenant subdomain before continuing."
        confirmLabel="Delete workspace"
        confirmColor="error"
        busy={deleteBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteOpen(false)}
      >
        <TextField
          value={deleteConfirm}
          onChange={(event) =>
            setDeleteConfirm(event.target.value.toUpperCase())
          }
          label={`Type ${deletePhrase || "confirmation text"}`}
          size="small"
          fullWidth
          sx={{ mt: 2 }}
        />
      </ConfirmActionDialog>
    </TenantWorkspacePageLayout>
  );
}
