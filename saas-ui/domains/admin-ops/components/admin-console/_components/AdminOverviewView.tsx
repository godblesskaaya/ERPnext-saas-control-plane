"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import { ConfirmActionDialog } from "../../../../shared/components/ConfirmActionDialog";
import { api, getApiErrorMessage } from "../../../../shared/lib/api";
import type { MetricsSummary } from "../../../../shared/lib/types";
import type { AdminControlLaneLink } from "./adminConsoleTypes";

type AdminOverviewViewProps = {
  activeCount: number;
  failedCount: number;
  suspendedCount: number;
  provisioningCount: number;
  tenantTotal: number;
  deadLettersCount: number;
  metricsSupported: boolean;
  metricsError: string | null;
  metrics: MetricsSummary | null;
  onRefreshMetrics: () => void;
  controlLaneLinks: AdminControlLaneLink[];
};

function metricCard(
  label: string,
  value: number,
  hint: string,
  tone: "default" | "good" | "warn" = "default",
) {
  const toneSx =
    tone === "good"
      ? {
          borderColor: "success.light",
          backgroundColor: "rgba(34,197,94,0.08)",
        }
      : tone === "warn"
        ? {
            borderColor: "warning.light",
            backgroundColor: "rgba(245,158,11,0.08)",
          }
        : {};

  return (
    <Card variant="outlined" sx={{ p: 2, ...toneSx }}>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "text.secondary",
        }}
      >
        {label}
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    </Card>
  );
}

export function AdminOverviewView({
  activeCount,
  failedCount,
  suspendedCount,
  provisioningCount,
  tenantTotal,
  deadLettersCount,
  metricsSupported,
  metricsError,
  metrics,
  onRefreshMetrics,
  controlLaneLinks,
}: AdminOverviewViewProps) {
  const attentionNeeded = failedCount || suspendedCount || deadLettersCount;
  const [confirmAction, setConfirmAction] = useState<
    null | "dunning" | "dunning-dry" | "assets" | "tls"
  >(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const [opsMessage, setOpsMessage] = useState<string | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);

  const runOpsAction = async () => {
    if (!confirmAction) return;
    setOpsBusy(true);
    setOpsMessage(null);
    setOpsError(null);
    try {
      const result =
        confirmAction === "dunning"
          ? await api.runBillingDunningCycle(false)
          : confirmAction === "dunning-dry"
            ? await api.runBillingDunningCycle(true)
            : confirmAction === "assets"
              ? await api.rebuildPlatformAssets()
              : await api.syncTenantTLS(false);
      if (!result.supported) {
        setOpsError("This admin operation is not available on this backend.");
        return;
      }
      setOpsMessage(
        result.data.message || "Admin operation queued successfully.",
      );
      setConfirmAction(null);
    } catch (err) {
      setOpsError(getApiErrorMessage(err, "Admin operation failed."));
    } finally {
      setOpsBusy(false);
    }
  };

  return (
    <>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ md: "center" }}
          gap={1.5}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Attention lane
          </Typography>
          <Chip
            size="small"
            color={attentionNeeded ? "warning" : "success"}
            label={
              attentionNeeded ? "Intervention recommended" : "Platform healthy"
            }
            variant="outlined"
          />
        </Stack>
        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Active tenants
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {activeCount}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Setup queue
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {provisioningCount}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Failed
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {failedCount}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Dead letters
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {deadLettersCount}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ sm: "center" }}
          gap={1.5}
          sx={{ mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Platform metrics
          </Typography>
          <Button size="small" variant="outlined" onClick={onRefreshMetrics}>
            Refresh
          </Button>
        </Stack>

        {!metricsSupported ? (
          <Typography variant="body2" color="text.secondary">
            Metrics endpoint is not available on this backend.
          </Typography>
        ) : metricsError ? (
          <Typography variant="body2" color="error.main">
            {metricsError}
          </Typography>
        ) : metrics ? (
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Total tenants",
                metrics.total_tenants,
                "All customer environments",
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Active tenants",
                metrics.active_tenants,
                "Currently operational",
                "good",
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Provisioning queue",
                metrics.provisioning_tenants,
                "Pending + provisioning",
                "warn",
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Pending payment",
                metrics.pending_payment_tenants,
                "Awaiting payment confirmation",
                "warn",
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Failed tenants",
                metrics.failed_tenants,
                "Needs operator action",
                metrics.failed_tenants ? "warn" : "default",
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Dead-letter jobs",
                metrics.dead_letter_count,
                "Recovery queue depth",
                metrics.dead_letter_count ? "warn" : "default",
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Jobs 24h",
                metrics.jobs_last_24h,
                "Activity in the last 24h",
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {metricCard(
                "Provisioning success (7d)",
                metrics.provisioning_success_rate_7d,
                "Percent succeeded",
                metrics.provisioning_success_rate_7d < 95 ? "warn" : "good",
              )}
            </Grid>
          </Grid>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Loading metrics...
          </Typography>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Billing and maintenance ops
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Trigger guarded operational jobs when automated recovery needs manual
          assistance.
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 2 }}
        >
          <Button
            variant="outlined"
            size="small"
            onClick={() => setConfirmAction("dunning")}
          >
            Run dunning cycle
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setConfirmAction("dunning-dry")}
          >
            Dry run dunning
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setConfirmAction("assets")}
          >
            Rebuild platform assets
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setConfirmAction("tls")}
          >
            Sync TLS certificates
          </Button>
        </Stack>
        {opsMessage ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {opsMessage}
          </Alert>
        ) : null}
        {opsError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {opsError}
          </Alert>
        ) : null}
      </Paper>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {metricCard(
            "Total tenants",
            tenantTotal,
            "All managed customer environments",
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {metricCard(
            "Suspended",
            suspendedCount,
            "Access paused pending review",
            suspendedCount ? "warn" : "default",
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {metricCard(
            "Provisioning",
            provisioningCount,
            "Still onboarding or awaiting payment",
            provisioningCount ? "warn" : "default",
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {metricCard(
            "Failed",
            failedCount,
            "Requires immediate operator follow-up",
            failedCount ? "warn" : "good",
          )}
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Control lanes
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Jump directly into focused admin workflows.
        </Typography>
        <Grid container spacing={1.5} sx={{ mt: 0.25 }}>
          {controlLaneLinks.map((lane) => (
            <Grid size={{ xs: 12, md: 6, xl: 4 }} key={lane.href}>
              <Card
                component={Link}
                href={lane.href}
                variant="outlined"
                sx={{
                  p: 2,
                  textDecoration: "none",
                  color: "inherit",
                  transition:
                    "border-color 160ms ease, background-color 160ms ease",
                  "&:hover": {
                    borderColor: "primary.light",
                    backgroundColor: "rgba(37,99,235,0.04)",
                  },
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {lane.label}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75 }}
                >
                  {lane.description}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1.25, display: "block" }}
                >
                  {lane.hint}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>
      <ConfirmActionDialog
        open={Boolean(confirmAction)}
        title="Confirm admin operation"
        body="This starts a privileged operational workflow. The action is logged and may affect tenant billing or runtime infrastructure."
        confirmLabel="Run operation"
        confirmColor="warning"
        busy={opsBusy}
        onConfirm={() => void runOpsAction()}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
