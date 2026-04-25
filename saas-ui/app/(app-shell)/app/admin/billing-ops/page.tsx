"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { getSessionRole } from "../../../../../domains/auth/auth";
import {
  loadBillingDunningQueue,
  queueBillingDunningCycle,
  renewTenantCheckout,
  toAdminErrorMessage,
} from "../../../../../domains/admin-ops/application/adminUseCases";
import { ConfirmActionDialog } from "../../../../../domains/shared/components/ConfirmActionDialog";
import { FeatureUnavailable, featureUnavailableMessage } from "../../../../../domains/shared/components/FeatureUnavailable";
import { TenantStatusChip } from "../../../../../domains/shared/components/TenantStatusChip";
import { formatTimestamp } from "../../../../../domains/shared/lib/formatters";
import { PageHeader } from "../../../../../domains/shell/components";
import type { DunningItem } from "../../../../../domains/shared/lib/types";

type CycleAction = "run" | "dry";

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "neutral" | "warning" | "error";
}) {
  const palette =
    tone === "error"
      ? { color: "error.main", bg: "error.light", border: "error.light" }
      : tone === "warning"
        ? { color: "warning.dark", bg: "warning.light", border: "warning.light" }
        : { color: "text.primary", bg: "background.paper", border: "divider" };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, borderColor: palette.border, bgcolor: palette.bg }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Typography
          variant="caption"
          sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, color: palette.color }}
        >
          {label}
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700, color: palette.color }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          {hint}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function BillingOpsPage() {
  const [operatorRole, setOperatorRole] = useState("user");
  const [tenants, setTenants] = useState<DunningItem[]>([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [cycleNotice, setCycleNotice] = useState<string | null>(null);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [confirmCycle, setConfirmCycle] = useState<CycleAction | null>(null);
  const [resumeBusyTenantId, setResumeBusyTenantId] = useState<string | null>(null);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const canRunAdminOnlyActions = operatorRole === "admin";

  useEffect(() => {
    const role = getSessionRole() ?? "user";
    setOperatorRole(role);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadBillingDunningQueue();
      if (result.supported) {
        setTenants(result.data);
        setSupported(true);
      } else {
        setSupported(false);
        setTenants([]);
      }
    } catch (err) {
      setError(toAdminErrorMessage(err, "Failed to load billing operations."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resumeCheckout = async (tenantId: string) => {
    if (!canRunAdminOnlyActions) {
      setResumeError("Only admin role can resume checkout links.");
      return;
    }

    setResumeBusyTenantId(tenantId);
    setResumeNotice(null);
    setResumeError(null);

    try {
      const result = await renewTenantCheckout(tenantId);
      if (!result.supported) {
        setResumeError(featureUnavailableMessage("Renewing checkout"));
        return;
      }

      const checkoutUrl = result.data.checkout_url;
      if (!checkoutUrl) {
        setResumeError("Billing provider did not return a checkout URL.");
        return;
      }

      if (typeof window !== "undefined") {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      }
      setResumeNotice("Checkout link generated and opened in a new tab.");
      await load();
    } catch (err) {
      setResumeError(toAdminErrorMessage(err, "Failed to renew checkout link."));
    } finally {
      setResumeBusyTenantId(null);
    }
  };

  const runCycle = async (action: CycleAction) => {
    if (!canRunAdminOnlyActions) {
      setCycleError("Only admin role can run billing dunning cycles.");
      return;
    }
    setRunningCycle(true);
    setCycleNotice(null);
    setCycleError(null);
    try {
      const result = await queueBillingDunningCycle(action === "dry");
      if (!result.supported) {
        setCycleError(featureUnavailableMessage("Running the dunning cycle"));
        return;
      }
      setCycleNotice(result.message || "Dunning cycle queued.");
      setConfirmCycle(null);
      await load();
    } catch (err) {
      setCycleError(toAdminErrorMessage(err, "Failed to queue dunning cycle."));
    } finally {
      setRunningCycle(false);
    }
  };

  const pendingCount = useMemo(
    () => tenants.filter((tenant) => tenant.status === "pending_payment").length,
    [tenants],
  );
  const suspendedCount = useMemo(
    () => tenants.filter((tenant) => tenant.status === "suspended_billing").length,
    [tenants],
  );
  const pastDueCount = useMemo(
    () =>
      tenants.filter((tenant) =>
        ["failed", "past_due", "unpaid", "cancelled"].includes(tenant.billing_status?.toLowerCase() ?? ""),
      ).length,
    [tenants],
  );

  const headerActions = (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Button
        variant="outlined"
        size="small"
        onClick={() => void load()}
        disabled={loading}
        sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
      {canRunAdminOnlyActions ? (
        <>
          <Button
            variant="contained"
            size="small"
            onClick={() => setConfirmCycle("run")}
            disabled={runningCycle}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Run dunning cycle
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setConfirmCycle("dry")}
            disabled={runningCycle}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Dry run
          </Button>
        </>
      ) : (
        <Chip size="small" variant="outlined" label="Read-only (support scope)" />
      )}
    </Stack>
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Billing operations"
        title="Dunning queue"
        subtitle="Track overdue subscriptions, pending payment confirmations, and billing suspensions."
        actions={headerActions}
      />

      {!supported ? <FeatureUnavailable feature="Billing dunning queue" /> : null}

      {supported ? (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
          }}
        >
          <MetricCard label="Pending payment" value={pendingCount} hint="Waiting for checkout confirmation" tone="neutral" />
          <MetricCard label="Suspended (billing)" value={suspendedCount} hint="Service paused for non-payment" tone="error" />
          <MetricCard label="Past due" value={pastDueCount} hint="Failed or overdue invoices" tone="warning" />
        </Box>
      ) : null}

      <Stack spacing={1}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {cycleNotice ? <Alert severity="success">{cycleNotice}</Alert> : null}
        {cycleError ? <Alert severity="error">{cycleError}</Alert> : null}
        {resumeNotice ? <Alert severity="success">{resumeNotice}</Alert> : null}
        {resumeError ? <Alert severity="error">{resumeError}</Alert> : null}
      </Stack>

      {supported ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, borderColor: "divider" }}>
          <Stack spacing={0.5} sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Billing follow-up list
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Use tenant detail to contact, retry, or update billing.
            </Typography>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead sx={{ bgcolor: "grey.50" }}>
                <TableRow>
                  <TableCell>Tenant</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Billing</TableCell>
                  <TableCell>Channel</TableCell>
                  <TableCell>Last invoice</TableCell>
                  <TableCell>Last attempt</TableCell>
                  <TableCell>Next retry</TableCell>
                  <TableCell>Grace ends</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        {loading ? "Loading billing queue…" : "No billing escalations right now."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  tenants.map((tenant) => (
                    <TableRow key={tenant.tenant_id} hover>
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Typography
                            component={Link}
                            href={`/app/tenants/${tenant.tenant_id}/overview`}
                            variant="body2"
                            sx={{ fontWeight: 700, color: "primary.main", textDecoration: "none" }}
                          >
                            {tenant.tenant_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {tenant.domain}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <TenantStatusChip status={tenant.status} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {tenant.billing_status ?? "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {tenant.payment_channel ?? "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {tenant.last_invoice_id ?? "—"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatTimestamp(tenant.last_payment_attempt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatTimestamp(tenant.next_retry_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatTimestamp(tenant.grace_ends_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                          <Button
                            variant="contained"
                            size="small"
                            disabled={
                              tenant.status !== "pending_payment" ||
                              !canRunAdminOnlyActions ||
                              resumeBusyTenantId === tenant.tenant_id
                            }
                            onClick={() => {
                              void resumeCheckout(tenant.tenant_id);
                            }}
                            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                          >
                            {resumeBusyTenantId === tenant.tenant_id ? "Generating..." : "Resume checkout"}
                          </Button>
                          <Button
                            component={Link}
                            href={`/app/tenants/${tenant.tenant_id}/billing`}
                            variant="outlined"
                            size="small"
                            sx={{ borderRadius: 99, textTransform: "none", whiteSpace: "nowrap" }}
                          >
                            Billing
                          </Button>
                          <Button
                            component={Link}
                            href={`/app/tenants/${tenant.tenant_id}/support`}
                            variant="outlined"
                            size="small"
                            sx={{ borderRadius: 99, textTransform: "none", whiteSpace: "nowrap" }}
                          >
                            Add note
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ px: 3, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
            <Typography variant="caption" color="text.secondary">
              Automated cycle is active. Use dry run before major billing state interventions.
            </Typography>
          </Box>
        </Paper>
      ) : null}

      <ConfirmActionDialog
        open={confirmCycle === "run"}
        title="Run dunning cycle?"
        body="This will trigger automated payment retries and reminder notifications across the queue."
        confirmLabel="Run cycle"
        confirmColor="primary"
        busy={runningCycle}
        onConfirm={() => void runCycle("run")}
        onCancel={() => setConfirmCycle(null)}
      />
      <ConfirmActionDialog
        open={confirmCycle === "dry"}
        title="Run dunning dry-run?"
        body="No billing actions will be taken. The result will preview what a real cycle would do."
        confirmLabel="Run dry run"
        busy={runningCycle}
        onConfirm={() => void runCycle("dry")}
        onCancel={() => setConfirmCycle(null)}
      />
    </Stack>
  );
}
