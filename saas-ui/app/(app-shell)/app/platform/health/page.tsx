"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

import {
  loadDashboardServiceHealthSnapshot,
  type DashboardEndpointHealth,
} from "../../../../../domains/dashboard/application/dashboardUseCases";
import { PageHeader } from "../../../../../domains/shell/components";

type HealthTone = "success" | "warning" | "error";

function toneFor(state: DashboardEndpointHealth["state"]): HealthTone {
  if (state === "ok") return "success";
  if (state === "unavailable") return "error";
  return "warning";
}

function HealthRow({ title, health, detail }: { title: string; health: DashboardEndpointHealth; detail: string }) {
  const tone = toneFor(health.state);
  const Icon = tone === "success" ? CheckCircleOutlineIcon : tone === "error" ? ErrorOutlineIcon : HelpOutlineIcon;
  const label = health.state === "ok" ? "Operational" : health.state === "unavailable" ? "Disrupted" : "Limited";

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 99,
              display: "grid",
              placeItems: "center",
              bgcolor: `${tone}.light`,
              color: `${tone}.main`,
              flexShrink: 0,
            }}
          >
            <Icon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
              <Chip size="small" label={label} color={tone} variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {detail}
            </Typography>
          </Box>
        </Stack>
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
      setError("Unable to refresh status right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const overall = useMemo<{ tone: HealthTone; title: string; body: string }>(() => {
    if (authHealth.state === "ok" && billingHealth.state === "ok") {
      return {
        tone: "success",
        title: "All systems operational",
        body: "Sign-in and billing are responding normally.",
      };
    }
    if (authHealth.state === "unavailable" || billingHealth.state === "unavailable") {
      return {
        tone: "error",
        title: "Service disruption detected",
        body: "At least one customer-facing service is not responding right now.",
      };
    }
    return {
      tone: "warning",
      title: "Limited visibility",
      body: "Some checks aren’t exposed on this deployment. The services may still be working normally.",
    };
  }, [authHealth.state, billingHealth.state]);

  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Platform"
        title="Service status"
        subtitle="A live readout of customer-facing services."
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

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Alert severity={overall.tone} variant="outlined" sx={{ borderRadius: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {overall.title}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.25 }}>
          {overall.body}
        </Typography>
      </Alert>

      <Stack spacing={1.5}>
        <HealthRow
          title="Sign-in &amp; account access"
          health={authHealth}
          detail="Whether users can log in and continue their workspace flow."
        />
        <HealthRow
          title="Billing &amp; payments"
          health={billingHealth}
          detail="Whether checkout and invoice services are responding."
        />
      </Stack>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3, display: "grid", gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            What you can do
          </Typography>
          <Typography variant="body2" color="text.secondary">
            If something looks off on your side, try these steps before contacting support.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              component={NextLink}
              href="/verify-email"
              variant="outlined"
              size="small"
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 600 }}
            >
              Verify email
            </Button>
            <Button
              component={NextLink}
              href="/app/account/settings"
              variant="outlined"
              size="small"
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 600 }}
            >
              Contact settings
            </Button>
            <Button
              component={NextLink}
              href="/app/billing/invoices"
              variant="outlined"
              size="small"
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 600 }}
            >
              Billing
            </Button>
            <Button
              component={NextLink}
              href="/app/support/queue"
              variant="contained"
              size="small"
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
            >
              Contact support
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
