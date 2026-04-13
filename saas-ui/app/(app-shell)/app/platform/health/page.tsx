"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Box, Button, Card, CardContent, Chip, Grid, Paper, Stack, Typography } from "@mui/material";

import { loadDashboardServiceHealthSnapshot, type DashboardEndpointHealth } from "../../../../../domains/dashboard/application/dashboardUseCases";

type HealthTone = "success" | "warning" | "error" | "default";

function toneForHealth(health: DashboardEndpointHealth): HealthTone {
  if (health.state === "ok") return "success";
  if (health.state === "unsupported") return "warning";
  if (health.state === "unavailable") return "error";
  return "default";
}

function labelForHealth(health: DashboardEndpointHealth): string {
  return health.state === "ok" ? health.message || "ok" : health.state;
}

function statusCopy(health: DashboardEndpointHealth): string {
  if (health.state === "ok") return "This service is responding normally for customer-facing actions.";
  if (health.state === "unsupported") return "This backend does not expose a live check here.";
  return "The latest check could not be completed right now.";
}

function HealthCard({
  title,
  health,
  detail,
}: {
  title: string;
  health: DashboardEndpointHealth;
  detail: string;
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "divider", height: "100%" }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 0.8 }}>
              {title}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.25 }}>
              {labelForHealth(health)}
            </Typography>
          </Box>
          <Chip label={health.state} color={toneForHealth(health)} size="small" />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {detail}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {statusCopy(health)}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function PlatformHealthPage() {
  const [authHealth, setAuthHealth] = useState<DashboardEndpointHealth>({ state: "unsupported", message: "unsupported" });
  const [billingHealth, setBillingHealth] = useState<DashboardEndpointHealth>({ state: "unsupported", message: "unsupported" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await loadDashboardServiceHealthSnapshot();
      setAuthHealth(snapshot.auth);
      setBillingHealth(snapshot.billing);
    } catch {
      setError("Unable to refresh platform health right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const overallTone = useMemo<"success" | "warning" | "error">(() => {
    if (authHealth.state === "ok" && billingHealth.state === "ok") return "success";
    if (authHealth.state === "unavailable" || billingHealth.state === "unavailable") return "error";
    return "warning";
  }, [authHealth.state, billingHealth.state]);

  const overallLabel = useMemo(() => {
    if (overallTone === "success") return "Customer services are responding normally.";
    if (overallTone === "error") return "At least one customer-facing check is unavailable.";
    return "Some checks are not exposed on this deployment.";
  }, [overallTone]);

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "divider" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="overline" sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 0.8 }}>
              Platform health
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
              Customer-safe service status
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              A simple readout for sign-in and billing availability without exposing internal operations details.
            </Typography>
          </Box>
          <Button variant="outlined" color="warning" onClick={() => void load()} disabled={loading} sx={{ borderRadius: 999 }}>
            {loading ? "Refreshing..." : "Refresh status"}
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
          {error}
        </Alert>
      ) : null}

      <Alert severity={overallTone} variant="outlined" sx={{ borderRadius: 3 }}>
        {overallLabel}
      </Alert>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, borderColor: "divider", height: "100%" }}>
            <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 0.8, fontWeight: 700 }}>
              Where you are
            </Typography>
            <Typography variant="subtitle1" sx={{ mt: 0.25, fontWeight: 700 }}>
              Dashboard platform health readout
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              This page gives a customer-safe status for sign-in and billing checks without exposing internal diagnostics.
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5, borderColor: "divider", height: "100%" }}>
            <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 0.8, fontWeight: 700 }}>
              What to do next
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
              <Button href="/dashboard/support" variant="contained" sx={{ borderRadius: 999 }}>
                Contact support
              </Button>
              <Button href="/billing" variant="outlined" color="inherit" sx={{ borderRadius: 999 }}>
                Check billing center
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <HealthCard
            title="Sign-in and account access"
            health={authHealth}
            detail="Use this to gauge whether users should be able to log in and continue their workspace flow."
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <HealthCard
            title="Billing and payments"
            health={billingHealth}
            detail="This reflects whether customer billing checks are available from the platform."
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "divider", height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              What customers should do next
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {[
                "If sign-in is affected, verify your email first and try again.",
                "If billing is the issue, open the billing center and confirm your payment status.",
                "If the problem affects many users or persists after a refresh, contact support with a screenshot and timestamp.",
              ].map((item) => (
                <Alert key={item} severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                  {item}
                </Alert>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "divider", height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Quick actions
            </Typography>
            <Stack spacing={1.25} sx={{ mt: 2 }}>
              <Button href="/verify-email" variant="contained" sx={{ borderRadius: 999 }}>
                Verify email
              </Button>
              <Button href="/dashboard/settings" variant="outlined" color="inherit" sx={{ borderRadius: 999 }}>
                Update contact settings
              </Button>
              <Button href="/billing" variant="outlined" color="inherit" sx={{ borderRadius: 999 }}>
                Open billing center
              </Button>
              <Button href="/dashboard/support" variant="outlined" color="inherit" sx={{ borderRadius: 999 }}>
                Contact support
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
