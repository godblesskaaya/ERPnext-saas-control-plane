"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import { getSessionRole } from "../../../../../domains/auth/auth";
import {
  getPlatformOpsErrorMessage,
  loadPlatformHealthSnapshot,
  runPlatformMaintenanceAction,
  type MaintenanceAction,
} from "../../../../../domains/platform-ops/application/platformHealthUseCases";
import { ConfirmActionDialog } from "../../../../../domains/shared/components/ConfirmActionDialog";
import { FeatureUnavailable } from "../../../../../domains/shared/components/FeatureUnavailable";
import { formatTimestamp } from "../../../../../domains/shared/lib/formatters";
import { PageHeader } from "../../../../../domains/shell/components";
import type { Job, Tenant, TenantRuntimeConsistencyReport } from "../../../../../domains/shared/lib/types";

type ApiHealth = {
  status?: string;
  service?: string;
  checks?: Record<string, string>;
};

const MAINTENANCE_LABELS: Record<MaintenanceAction, { title: string; subtitle: string; confirmBody: string }> = {
  assets: {
    title: "Rebuild ERP assets",
    subtitle: "Recompiles bundled assets when customers report 404s on workspace UI.",
    confirmBody:
      "This will rebuild ERP assets across the platform. Customer workspaces may briefly show stale assets until the rebuild completes.",
  },
  tls: {
    title: "Sync tenant TLS routes",
    subtitle: "Refreshes proxy/TLS routing for all tenant subdomains.",
    confirmBody: "This refreshes TLS routing across all tenant subdomains. Routing changes are usually instant.",
  },
  "tls-prime": {
    title: "Prime tenant certificates",
    subtitle: "Pre-warms TLS certificates for tenant subdomains to avoid first-hit delays.",
    confirmBody:
      "This pre-warms TLS certificates for tenant subdomains. It is safe to run anytime but may take several minutes.",
  },
};

function runtimeClassificationLabel(classification: string): string {
  switch (classification) {
    case "runtime_expected_missing":
      return "Expected runtime missing";
    case "pending_without_runtime":
      return "Pending without runtime";
    case "pending_payment_without_runtime":
      return "Pending payment without runtime";
    case "deleted_with_runtime":
      return "Deleted row still has runtime";
    default:
      return classification.replace(/_/g, " ");
  }
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "warning" | "error" | "success";
}) {
  const palette =
    tone === "error"
      ? { color: "error.main", bg: "error.light" }
      : tone === "warning"
        ? { color: "warning.dark", bg: "warning.light" }
        : tone === "success"
          ? { color: "success.dark", bg: "success.light" }
          : { color: "text.primary", bg: "background.paper" };
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, bgcolor: palette.bg }}>
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
        {hint ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            {hint}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function PlatformHealthPage() {
  const [operatorRole, setOperatorRole] = useState("user");
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [billingHealth, setBillingHealth] = useState<string>("checking");
  const [authHealth, setAuthHealth] = useState<string>("checking");
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<MaintenanceAction | null>(null);
  const [tenantRuntimeConsistency, setTenantRuntimeConsistency] = useState<TenantRuntimeConsistencyReport | null>(null);
  const canRunAdminOnlyActions = operatorRole === "admin";

  useEffect(() => {
    const role = getSessionRole() ?? "user";
    setOperatorRole(role);
  }, []);

  const load = async () => {
    setLoading(true);
    setHealthError(null);
    try {
      const snapshot = await loadPlatformHealthSnapshot();
      setHealth(snapshot.health);
      setJobs(snapshot.jobs);
      setTenants(snapshot.tenants);
      setAuthHealth(snapshot.authHealth);
      setBillingHealth(snapshot.billingHealth);
      setTenantRuntimeConsistency(snapshot.tenantRuntimeConsistency);
      if (!snapshot.healthAvailable) {
        setHealthError("API health checks aren’t responding right now.");
      }
    } catch (err) {
      setHealthError(getPlatformOpsErrorMessage(err, "Failed to load platform health."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runMaintenance = async (action: MaintenanceAction) => {
    if (!canRunAdminOnlyActions) {
      setMaintenanceError("Only admin role can run maintenance actions.");
      return;
    }
    setMaintenanceBusy(true);
    setMaintenanceError(null);
    setMaintenanceMessage(null);
    try {
      const result = await runPlatformMaintenanceAction(action);
      if (result.supported) {
        setMaintenanceMessage(result.message);
      } else {
        setMaintenanceError(result.message);
      }
      setConfirmAction(null);
    } catch (err) {
      setMaintenanceError(getPlatformOpsErrorMessage(err, "Maintenance action failed."));
    } finally {
      setMaintenanceBusy(false);
    }
  };

  const failedJobs = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "failed"), [jobs]);
  const runningJobs = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "running"), [jobs]);
  const queuedJobs = useMemo(() => jobs.filter((job) => job.status.toLowerCase() === "queued"), [jobs]);
  const suspendedTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status.toLowerCase().includes("suspended")).length,
    [tenants],
  );
  const runtimeGapCount = useMemo(() => {
    if (!tenantRuntimeConsistency) return 0;
    return tenantRuntimeConsistency.entries.length + tenantRuntimeConsistency.runtime_only_sites.length;
  }, [tenantRuntimeConsistency]);

  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Admin"
        title="Platform health"
        subtitle="Service status, queue health, and reconciliation signals across the platform."
        actions={
          <Button
            variant="outlined"
            onClick={() => void load()}
            disabled={loading}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {healthError ? <Alert severity="error">{healthError}</Alert> : null}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
        }}
      >
        <MetricCard label="API status" value={health?.status ?? "unknown"} hint={health?.service ?? "Control plane API"} />
        <MetricCard label="Auth health" value={authHealth} hint="/api/auth/health" />
        <MetricCard label="Billing health" value={billingHealth} hint="/api/billing/health" />
        <MetricCard label="Suspended tenants" value={suspendedTenants} hint="Billing or admin suspensions" tone="warning" />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Tenant runtime consistency
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Tenant rows that don’t reconcile with actual ERP runtimes — clean these up before they leak into billing or support
              workflows.
            </Typography>
          </Box>
          <Chip
            label={`${runtimeGapCount} reconciliation signal${runtimeGapCount === 1 ? "" : "s"}`}
            color={runtimeGapCount > 0 ? "warning" : "success"}
            variant="outlined"
          />
        </Stack>

        {tenantRuntimeConsistency ? (
          <>
            <Box
              sx={{
                mt: 2,
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(5, 1fr)" },
              }}
            >
              <MetricCard label="Expected missing" value={tenantRuntimeConsistency.runtime_expected_missing} tone="warning" />
              <MetricCard label="Pending no runtime" value={tenantRuntimeConsistency.pending_without_runtime} />
              <MetricCard label="Pending payment" value={tenantRuntimeConsistency.pending_payment_without_runtime} />
              <MetricCard label="Deleted w/ runtime" value={tenantRuntimeConsistency.deleted_with_runtime} tone="error" />
              <MetricCard label="Runtime-only" value={tenantRuntimeConsistency.runtime_sites_without_db_entry} />
            </Box>

            {tenantRuntimeConsistency.entries.length ? (
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {tenantRuntimeConsistency.entries.map((entry) => (
                  <Card key={entry.tenant_id} variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ p: 2 }}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between">
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {entry.domain}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                            {runtimeClassificationLabel(entry.classification)} · status={entry.status} · subscription=
                            {entry.subscription_status ?? "n/a"} · plan={entry.plan ?? "n/a"}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={entry.runtime_exists ? "runtime found" : "runtime missing"}
                          variant="outlined"
                          color={entry.runtime_exists ? "default" : "warning"}
                        />
                      </Stack>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Owner: <strong>{entry.owner_email ?? "—"}</strong>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Last job: <strong>{entry.last_job_type ?? "—"}{entry.last_job_status ? ` (${entry.last_job_status})` : ""}</strong>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Last job at: <strong>{formatTimestamp(entry.last_job_at)}</strong>
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            ) : (
              <Alert severity="success" variant="outlined" sx={{ mt: 2, borderRadius: 2 }}>
                No tenant-runtime mismatches detected right now.
              </Alert>
            )}

            {tenantRuntimeConsistency.runtime_only_sites.length ? (
              <Box sx={{ mt: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, display: "block", mb: 1 }}
                >
                  Runtime sites without DB rows
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {tenantRuntimeConsistency.runtime_only_sites.map((site) => (
                    <Chip key={site} label={site} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            ) : null}
          </>
        ) : (
          <Box sx={{ mt: 2 }}>
            <FeatureUnavailable feature="Tenant runtime consistency report" />
          </Box>
        )}
      </Paper>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "1.2fr 1fr" },
        }}
      >
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Queue health
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Job backlog and failure signal across the platform.
          </Typography>
          <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
            <MetricCard label="Queued" value={queuedJobs.length} />
            <MetricCard label="Running" value={runningJobs.length} />
            <MetricCard label="Failed" value={failedJobs.length} tone={failedJobs.length > 0 ? "error" : "success"} />
          </Box>

          {failedJobs.length ? (
            <Stack spacing={1.25} sx={{ mt: 2 }}>
              {failedJobs.slice(0, 5).map((job) => (
                <Card key={job.id} variant="outlined" sx={{ borderRadius: 2, bgcolor: "error.light" }}>
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="caption" color="error.dark" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {formatTimestamp(job.created_at)}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.25, color: "error.dark" }}>
                      {job.type}
                    </Typography>
                    <Typography variant="caption" color="error.dark">
                      {job.error ?? "Failed job"}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ) : (
            <Alert severity="success" variant="outlined" sx={{ mt: 2, borderRadius: 2 }}>
              No failed jobs in the last 80 operations.
            </Alert>
          )}
        </Paper>

        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Core service checks
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Postgres and Redis health from the API node.
            </Typography>
            <Stack spacing={1} sx={{ mt: 2 }}>
              {health?.checks ? (
                Object.entries(health.checks).map(([service, status]) => (
                  <Stack
                    key={service}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ px: 1.5, py: 1, borderRadius: 2, border: "1px solid", borderColor: "divider" }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {service}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {status}
                    </Typography>
                  </Stack>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No infrastructure checks returned.
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Maintenance actions
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Platform fixes for tenant TLS certificates and ERP assets.
            </Typography>
            {canRunAdminOnlyActions ? (
              <Stack spacing={1} sx={{ mt: 2 }}>
                {(Object.keys(MAINTENANCE_LABELS) as MaintenanceAction[]).map((action) => {
                  const label = MAINTENANCE_LABELS[action];
                  return (
                    <Button
                      key={action}
                      variant="outlined"
                      size="small"
                      disabled={maintenanceBusy}
                      onClick={() => setConfirmAction(action)}
                      sx={{ justifyContent: "flex-start", textTransform: "none", fontWeight: 600, borderRadius: 2, py: 1 }}
                    >
                      <Box sx={{ textAlign: "left" }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {label.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {label.subtitle}
                        </Typography>
                      </Box>
                    </Button>
                  );
                })}
              </Stack>
            ) : (
              <Alert severity="info" variant="outlined" sx={{ mt: 2, borderRadius: 2 }}>
                Read-only maintenance view for support role.
              </Alert>
            )}
            {maintenanceMessage ? (
              <Alert severity="success" variant="outlined" sx={{ mt: 2, borderRadius: 2 }}>
                {maintenanceMessage}
              </Alert>
            ) : null}
            {maintenanceError ? (
              <Alert severity="error" variant="outlined" sx={{ mt: 2, borderRadius: 2 }}>
                {maintenanceError}
              </Alert>
            ) : null}
          </Paper>
        </Stack>
      </Box>

      <ConfirmActionDialog
        open={confirmAction !== null}
        title={confirmAction ? MAINTENANCE_LABELS[confirmAction].title : ""}
        body={confirmAction ? MAINTENANCE_LABELS[confirmAction].confirmBody : ""}
        confirmLabel={confirmAction ? MAINTENANCE_LABELS[confirmAction].title : ""}
        busy={maintenanceBusy}
        onConfirm={() => confirmAction && void runMaintenance(confirmAction)}
        onCancel={() => setConfirmAction(null)}
      />
    </Stack>
  );
}
