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
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadTenantCurrentUser,
  loadTenantRecentJobs,
  loadTenantSummary,
  retryTenantProvisioningAction,
  suspendTenantAccess,
  toTenantDetailErrorMessage,
  unsuspendTenantAccess,
} from "../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { useTenantRouteContext } from "../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";
import { TenantSectionLinks } from "../../../../../domains/tenant-ops/ui/tenant-detail/sections";
import type { Job, TenantSummary, UserProfile } from "../../../../../domains/shared/lib/types";

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

export default function TenantOverviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { tenant, error, loadTenant } = useTenantRouteContext(id);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [recentJobsError, setRecentJobsError] = useState<string | null>(null);
  const [recentJobsSupported, setRecentJobsSupported] = useState(true);
  const [tenantSummary, setTenantSummary] = useState<TenantSummary | null>(null);
  const [tenantSummaryError, setTenantSummaryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isAdmin = currentUser?.role === "admin";

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await loadTenantCurrentUser();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const loadRecentJobsData = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantRecentJobs(id, 40, 5);
      if (!result.supported) {
        setRecentJobsSupported(false);
        setRecentJobs([]);
        setRecentJobsError(null);
        return;
      }
      setRecentJobsSupported(true);
      setRecentJobs(result.data ?? []);
      setRecentJobsError(null);
    } catch (err) {
      setRecentJobsError(toTenantDetailErrorMessage(err, "Failed to load recent jobs"));
    }
  }, [id]);

  const loadTenantSummaryData = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantSummary(id);
      if (!result.supported) {
        setTenantSummary(null);
        setTenantSummaryError("Tenant summary endpoint not available.");
        return;
      }
      setTenantSummary(result.data);
      setTenantSummaryError(null);
    } catch (err) {
      setTenantSummaryError(toTenantDetailErrorMessage(err, "Failed to load tenant summary"));
    }
  }, [id]);

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
      await loadRecentJobsData();
    } catch (err) {
      setActionError(toTenantDetailErrorMessage(err, "Failed to retry provisioning"));
    } finally {
      setRetrying(false);
    }
  }, [id, loadRecentJobsData, loadTenant]);

  useEffect(() => {
    void loadCurrentUser();
    void loadRecentJobsData();
    void loadTenantSummaryData();
  }, [loadCurrentUser, loadRecentJobsData, loadTenantSummaryData]);

  const activeRecentJob = useMemo(
    () => recentJobs.find((job) => !TERMINAL_JOB_STATUSES.has((job.status || "").toLowerCase())),
    [recentJobs]
  );

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  if (!tenant) {
    return <Typography color={error ? "error" : "text.secondary"}>{error ?? "Loading tenant..."}</Typography>;
  }

  return (
    <Box sx={{ display: "grid", gap: 3, pb: 4 }}>
      <Stack spacing={0.5}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
          Overview
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tenant.company_name} ({tenant.domain})
        </Typography>
      </Stack>

      <TenantSectionLinks tenantId={id} />

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
          <Stack spacing={1}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "warning.dark" }}>
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
              sx={{ borderRadius: 99, px: 2, py: 1, textTransform: "none", fontWeight: 700, bgcolor: "#0d6a6a" }}
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
                sx={{ mt: 1, display: "inline-block", fontWeight: 700, color: "#0d6a6a" }}
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

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Quick actions
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
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

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
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
                    href={`/tenants/${id}/jobs?job=${job.id}`}
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

      {error ? <Alert severity="error">{error}</Alert> : null}
    </Box>
  );
}
