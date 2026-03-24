"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import {
  loadDashboardMetricsSnapshot,
  loadDashboardServiceHealthSnapshot,
  type DashboardEndpointState,
} from "../../../domains/dashboard/application/dashboardUseCases";
import { getDashboardNavSectionsByMode } from "../../../domains/dashboard/domain/navigation";
import type { MetricsSummary } from "../../../domains/shared/lib/types";

type EndpointState = "loading" | DashboardEndpointState;
type JourneyCard = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  value?: number;
};

function renderMetric(value: number | undefined, loading: boolean): string {
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return loading ? "…" : "—";
}

function endpointColor(state: EndpointState): "success" | "warning" | "error" | "default" {
  if (state === "ok") return "success";
  if (state === "unsupported") return "warning";
  if (state === "unavailable") return "error";
  return "default";
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [authState, setAuthState] = useState<EndpointState>("loading");
  const [billingState, setBillingState] = useState<EndpointState>("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      const [nextMetrics, health] = await Promise.all([
        loadDashboardMetricsSnapshot(),
        loadDashboardServiceHealthSnapshot(),
      ]);
      if (!active) return;
      // AGENT-NOTE: metrics endpoint can be absent on older deployments. Keep the hub usable with graceful fallback.
      setMetrics(nextMetrics);
      setMetricsLoading(false);
      setAuthState(health.auth.state);
      setBillingState(health.billing.state);
    })().catch(() => {
      if (!active) return;
      setMetrics(null);
      setMetricsLoading(false);
      setAuthState("unavailable");
      setBillingState("unavailable");
    });

    return () => {
      active = false;
    };
  }, []);

  const journeyCards = useMemo<JourneyCard[]>(
    () => [
      {
        eyebrow: "Workspace",
        title: "Workspace overview",
        description: "Start from a consolidated summary of tenant and platform activity.",
        href: "/dashboard/overview",
        value: metrics?.jobs_last_24h,
      },
      {
        eyebrow: "Workspace",
        title: "Tenant registry",
        description: "Search workspaces and open tenant-level control pages.",
        href: "/dashboard/registry",
        value: metrics?.total_tenants,
      },
      {
        eyebrow: "Workspace",
        title: "Active workspaces",
        description: "Review live tenants and continue routine workspace operations.",
        href: "/dashboard/active",
        value: metrics?.active_tenants,
      },
      {
        eyebrow: "Workspace",
        title: "Payment center",
        description: "Resume failed checkout and review customer billing invoices.",
        href: "/billing",
        value: metrics?.pending_payment_tenants,
      },
    ],
    [metrics],
  );
  const visibleSections = useMemo(() => getDashboardNavSectionsByMode("workspace"), []);

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 3, borderRadius: 4, bgcolor: "background.paper" }}>
        <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
          Journey hub
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Workspace command center
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 920 }}>
          Customer-facing workspace only: overview, tenant registry, account settings, and billing recovery.
        </Typography>
      </Paper>

      <Grid container spacing={2}>
        {journeyCards.map((card) => (
          <Grid key={card.href} size={{ xs: 12, md: 6, xl: 3 }}>
            <Card variant="outlined" sx={{ height: "100%", borderRadius: 3 }}>
              <CardActionArea component={NextLink} href={card.href} sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                    {card.eyebrow}
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 700 }}>
                    {card.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    {card.description}
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 2, fontWeight: 700 }}>
                    {renderMetric(card.value, metricsLoading)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 3, borderRadius: 4 }}>
        <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
          Platform snapshot
        </Typography>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                  Active tenants
                </Typography>
                <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
                  {renderMetric(metrics?.active_tenants, metricsLoading)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                  Tenants total
                </Typography>
                <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
                  {renderMetric(metrics?.total_tenants, metricsLoading)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                  Jobs (24h)
                </Typography>
                <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
                  {renderMetric(metrics?.jobs_last_24h, metricsLoading)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 3, borderRadius: 4 }}>
        <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
          Endpoint health
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mt: 1.5 }}>
          <Chip label="API ok" color="success" variant="outlined" sx={{ justifyContent: "flex-start" }} />
          <Chip label={`Auth ${authState}`} color={endpointColor(authState)} variant="outlined" sx={{ justifyContent: "flex-start" }} />
          <Chip
            label={`Billing ${billingState}`}
            color={endpointColor(billingState)}
            variant="outlined"
            sx={{ justifyContent: "flex-start" }}
          />
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        {visibleSections.map((section) => {
          const links = section.items.filter((item) => item.href !== "/dashboard" && !item.href.startsWith("/admin"));
          return (
            <Grid key={section.title} size={{ xs: 12, xl: 6 }}>
              <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 2.5, borderRadius: 4, height: "100%" }}>
                <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
                  {section.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  {section.description}
                </Typography>
                <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                  {links.map((item) => (
                    <Card key={item.href} variant="outlined" sx={{ borderRadius: 2.5 }}>
                      <CardActionArea component={NextLink} href={item.href}>
                        <CardContent sx={{ py: 1.25 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {item.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.hint}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ))}
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {!metricsLoading && !metrics ? (
        <Alert severity="warning" variant="outlined">
          Metrics endpoint is unavailable on this deployment. Navigation and workspace actions remain available.
        </Alert>
      ) : null}
    </Stack>
  );
}
