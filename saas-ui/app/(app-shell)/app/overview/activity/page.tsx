"use client";

import NextLink from "next/link";
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

import {
  loadWorkspaceCurrentUserProfile,
  loadWorkspaceQueueData,
  toWorkspaceQueueErrorMessage,
} from "../../../../../domains/tenant-ops/application/workspaceQueueUseCases";
import type { Tenant, UserProfile } from "../../../../../domains/shared/lib/types";

type ActivityTone = "success" | "warning" | "error" | "info" | "default";

type ActivityEntry = {
  id: string;
  tenantName: string;
  tenantPath: string;
  timestamp: string;
  statusLabel: string;
  statusTone: ActivityTone;
  summary: string;
  details: string;
};

type ActivitySummary = {
  active: number;
  pendingPayment: number;
  provisioning: number;
  suspended: number;
  failed: number;
};

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "Timestamp unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Timestamp unavailable";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getActivityTone(status: string): ActivityTone {
  switch (status.toLowerCase()) {
    case "active":
      return "success";
    case "pending_payment":
    case "provisioning":
    case "upgrading":
    case "restoring":
      return "warning";
    case "failed":
    case "suspended":
    case "suspended_admin":
    case "suspended_billing":
      return "error";
    default:
      return "info";
  }
}

function getActivitySummary(tenant: Tenant): { label: string; summary: string; details: string } {
  const status = tenant.status.toLowerCase();

  if (status === "active") {
    return {
      label: "Workspace active",
      summary: "Ready for daily work.",
      details: "Customer users can continue operating without provisioning blockers.",
    };
  }

  if (status === "pending_payment") {
    return {
      label: "Payment pending",
      summary: "Checkout or renewal needs attention.",
      details: "Follow up from the customer workspace if billing confirmation is required.",
    };
  }

  if (status === "provisioning" || status === "pending" || status === "upgrading" || status === "restoring") {
    return {
      label: "Provisioning in progress",
      summary: "Background setup is still running.",
      details: "Review the workspace once the deployment or restore finishes.",
    };
  }

  if (status === "suspended_billing" || status === "suspended" || status === "suspended_admin") {
    return {
      label: "Workspace suspended",
      summary: "Access is currently restricted.",
      details: "Billing or policy remediation is needed before the workspace resumes normal use.",
    };
  }

  if (status === "failed") {
    return {
      label: "Action required",
      summary: "The last lifecycle step failed.",
      details: "Investigate the tenant record and retry the failing operation from the registry.",
    };
  }

  return {
    label: "Lifecycle update",
    summary: "Tenant record changed recently.",
    details: "Check the tenant details page for the authoritative timeline and state transitions.",
  };
}

function summarizeRecentActivity(tenants: Tenant[]): ActivitySummary {
  return tenants.reduce<ActivitySummary>(
    (acc, tenant) => {
      const status = tenant.status.toLowerCase();
      if (status === "active") acc.active += 1;
      if (status === "pending_payment") acc.pendingPayment += 1;
      if (status === "provisioning" || status === "pending" || status === "upgrading" || status === "restoring") {
        acc.provisioning += 1;
      }
      if (status === "suspended" || status === "suspended_admin" || status === "suspended_billing") {
        acc.suspended += 1;
      }
      if (status === "failed") acc.failed += 1;
      return acc;
    },
    { active: 0, pendingPayment: 0, provisioning: 0, suspended: 0, failed: 0 },
  );
}

function buildActivityEntries(tenants: Tenant[]): ActivityEntry[] {
  return [...tenants]
    .sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.created_at).getTime();
      const rightTime = new Date(right.updated_at || right.created_at).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 8)
    .map((tenant) => {
      const activity = getActivitySummary(tenant);
      return {
        id: tenant.id,
        tenantName: tenant.company_name,
        tenantPath: `/app/tenants/${tenant.id}/overview`,
        timestamp: formatTimestamp(tenant.updated_at || tenant.created_at),
        statusLabel: activity.label,
        statusTone: getActivityTone(tenant.status),
        summary: activity.summary,
        details: activity.details,
      };
    });
}

export default function DashboardActivityPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [profileResult, feedResult] = await Promise.allSettled([
        loadWorkspaceCurrentUserProfile(),
        loadWorkspaceQueueData({
          page: 1,
          limit: 12,
          showStatusFilter: false,
          statusFilterValue: "all",
          search: "",
          planFilter: "all",
        }),
      ]);

      if (!active) {
        return;
      }

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
      }

      if (feedResult.status === "fulfilled") {
        setTenants(feedResult.value.tenants);
        setTotalTenants(feedResult.value.total);
      } else {
        setTenants([]);
        setTotalTenants(0);
        setError(toWorkspaceQueueErrorMessage(feedResult.reason, "Failed to load workspace activity."));
      }

      if (profileResult.status === "rejected" && feedResult.status === "fulfilled") {
        setError(toWorkspaceQueueErrorMessage(profileResult.reason, "Failed to load workspace profile."));
      }

      setLoading(false);
    })().catch((caughtError) => {
      if (!active) {
        return;
      }
      setTenants([]);
      setTotalTenants(0);
      setError(toWorkspaceQueueErrorMessage(caughtError, "Failed to load workspace activity."));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const activityEntries = useMemo(() => buildActivityEntries(tenants), [tenants]);
  const summary = useMemo(() => summarizeRecentActivity(tenants), [tenants]);
  const hasEntries = activityEntries.length > 0;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
        <Stack spacing={1.25}>
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 0.8, color: "primary.main" }}>
            Customer workspace
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Activity timeline
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 900 }}>
            Recent tenant-facing changes, billing follow-ups, and lifecycle updates for the workspace you manage.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ pt: 0.5 }} flexWrap="wrap">
            <Chip label={profile ? `Signed in as ${profile.email}` : "Workspace user"} variant="outlined" />
            <Chip label={loading ? "Loading feed…" : `${totalTenants.toLocaleString()} tenant records`} variant="outlined" />
            <Chip label="Customer-facing only" color="primary" variant="outlined" />
          </Stack>
        </Stack>
      </Paper>

      {error ? (
        <Alert
          severity="warning"
          action={
            <Button component={NextLink} href="/app/tenants" color="inherit" size="small">
              Open registry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
              Active
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
              {summary.active.toLocaleString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Workspaces ready for normal daily use.
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
              Needs attention
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
              {(summary.pendingPayment + summary.provisioning + summary.suspended + summary.failed).toLocaleString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Items with billing, provisioning, suspension, or failure follow-up.
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
              Latest feed items
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
              {activityEntries.length.toLocaleString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Recent lifecycle changes shown in the timeline below.
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between">
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Recent actions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The newest workspace changes are surfaced here first.
            </Typography>
          </Box>
          <Button component={NextLink} href="/app/overview" variant="outlined" sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}>
            Open overview
          </Button>
        </Stack>

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {hasEntries ? (
            activityEntries.map((entry) => (
              <Paper
                key={entry.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 3,
                  borderLeft: "4px solid",
                  borderLeftColor: `${entry.statusTone}.main`,
                  bgcolor: "background.paper",
                }}
              >
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between">
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {entry.tenantName}
                      </Typography>
                      <Chip
                        label={entry.statusLabel}
                        size="small"
                        color={entry.statusTone === "default" ? "default" : entry.statusTone}
                        variant="outlined"
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {entry.summary}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      {entry.details}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: { sm: 200 } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                      Updated
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {entry.timestamp}
                    </Typography>
                    <Button
                      component={NextLink}
                      href={entry.tenantPath}
                      size="small"
                      sx={{ mt: 1, p: 0, textTransform: "none", fontWeight: 700 }}
                    >
                      View tenant record
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            ))
          ) : (
            <Alert severity="info">
              No recent workspace activity is available yet. Once tenants are created, activated, suspended, or retried, the latest changes will appear here.
            </Alert>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
