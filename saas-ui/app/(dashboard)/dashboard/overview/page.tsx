"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, Grid, Paper, Typography } from "@mui/material";

import { loadDashboardServiceHealthSnapshot } from "../../../../domains/dashboard/application/dashboardUseCases";
import { WorkspaceQueuePage } from "../../../../domains/dashboard/components/WorkspaceQueuePage";

export default function DashboardOverviewPage() {
  const [authHealth, setAuthHealth] = useState("checking");
  const [billingHealth, setBillingHealth] = useState("checking");

  useEffect(() => {
    let active = true;
    void (async () => {
      const health = await loadDashboardServiceHealthSnapshot();
      if (!active) return;
      setAuthHealth(health.auth.message);
      setBillingHealth(health.billing.message);
    })().catch(() => {
      if (!active) return;
      setAuthHealth("unavailable");
      setBillingHealth("unavailable");
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <WorkspaceQueuePage
      routeScope="workspace"
      title="Workspace overview"
      description="Live workspace snapshot for Tanzania: payments, provisioning, and customer health in one console."
      extraContent={
        <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 2, borderRadius: 4 }}>
          <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
            Diagnostics
          </Typography>
          <Grid container spacing={1} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Typography variant="caption" color="text.secondary">API</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>ok</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Typography variant="caption" color="text.secondary">Auth</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{authHealth}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Typography variant="caption" color="text.secondary">Billing</Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{billingHealth}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>
      }
      showCreate
      showMetrics
      showAttention
      showActionCenter
      showBillingAlert
      showStatusFilter
    />
  );
}
