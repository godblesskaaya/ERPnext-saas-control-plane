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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import {
  loadWorkspaceCurrentUserProfile,
  loadWorkspaceQueueData,
  toWorkspaceQueueErrorMessage,
} from "../../../../domains/tenant-ops/application/workspaceQueueUseCases";
import type { Tenant, UserProfile } from "../../../../domains/shared/lib/types";

type AuditTone = "success" | "warning" | "error" | "info" | "default";

type AuditEvent = {
  id: string;
  time: string;
  actor: string;
  subject: string;
  action: string;
  evidence: string;
  tone: AuditTone;
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

function getAuditTone(status: string): AuditTone {
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
    case "pending_deletion":
    case "deleting":
      return "error";
    default:
      return "info";
  }
}

function describeAuditEvent(tenant: Tenant): { action: string; evidence: string } {
  const status = tenant.status.toLowerCase();

  if (status === "active") {
    return {
      action: "Workspace active",
      evidence: "Operational use is permitted and the customer can continue normal activity.",
    };
  }

  if (status === "pending_payment") {
    return {
      action: "Payment follow-up required",
      evidence: "Billing confirmation is needed before the workspace can move forward cleanly.",
    };
  }

  if (status === "provisioning" || status === "pending" || status === "upgrading" || status === "restoring") {
    return {
      action: "Lifecycle job in progress",
      evidence: "A provisioning or maintenance step is still running and should be monitored.",
    };
  }

  if (status === "suspended_billing" || status === "suspended" || status === "suspended_admin") {
    return {
      action: "Workspace suspended",
      evidence: "Access was restricted and should remain documented until the issue is resolved.",
    };
  }

  if (status === "failed") {
    return {
      action: "Operational failure recorded",
      evidence: "The latest lifecycle operation failed and should be reviewed before any retry.",
    };
  }

  return {
    action: "Workspace state changed",
    evidence: "This record is included so customer teams can trace recent lifecycle changes.",
  };
}

function buildAuditEvents(tenants: Tenant[]): AuditEvent[] {
  return [...tenants]
    .sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.created_at).getTime();
      const rightTime = new Date(right.updated_at || right.created_at).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 10)
    .map((tenant) => {
      const status = tenant.status.toLowerCase();
      const audit = describeAuditEvent(tenant);
      return {
        id: tenant.id,
        time: formatTimestamp(tenant.updated_at || tenant.created_at),
        actor: status === "active" ? "Tenant user" : "Platform workflow",
        subject: tenant.company_name,
        action: audit.action,
        evidence: audit.evidence,
        tone: getAuditTone(status),
      };
    });
}

export default function DashboardAuditPage() {
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
        setError(toWorkspaceQueueErrorMessage(feedResult.reason, "Failed to load compliance events."));
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
      setError(toWorkspaceQueueErrorMessage(caughtError, "Failed to load compliance events."));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const auditEvents = useMemo(() => buildAuditEvents(tenants), [tenants]);
  const hasEvents = auditEvents.length > 0;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
        <Stack spacing={1.25}>
          <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 0.8, color: "primary.main" }}>
            Customer compliance
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Audit events
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 900 }}>
            Customer-visible lifecycle records and compliance-relevant workspace changes. Use this as a safe read-only view when a full audit export is not available.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ pt: 0.5 }} flexWrap="wrap">
            <Chip label={profile ? `Signed in as ${profile.email}` : "Workspace user"} variant="outlined" />
            <Chip label={loading ? "Loading audit feed…" : `${totalTenants.toLocaleString()} workspace records`} variant="outlined" />
            <Chip label="Read-only compliance view" color="primary" variant="outlined" />
          </Stack>
        </Stack>
      </Paper>

      <Alert severity="info">
        This page summarizes customer-facing state changes. For a tenant-specific immutable audit log, open the tenant record in the registry.
      </Alert>

      {error ? (
        <Alert
          severity="warning"
          action={
            <Button component={NextLink} href="/dashboard/registry" color="inherit" size="small">
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
              Compliance events
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
              {auditEvents.length.toLocaleString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Recent records sourced from the workspace feed.
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
              Coverage
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
              {hasEvents ? "Current" : "Empty"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Events are summarized safely even when a backend audit endpoint is unavailable.
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
              Review path
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
              {hasEvents ? "Tenant detail" : "Registry"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Move from the summary into a specific tenant record for deeper investigation.
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between">
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Compliance trail
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Audit-relevant changes sorted newest first.
            </Typography>
          </Box>
          <Button component={NextLink} href="/dashboard/overview" variant="outlined" sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}>
            Open overview
          </Button>
        </Stack>

        <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, borderRadius: 3 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: "grey.50" }}>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Workspace</TableCell>
                <TableCell>Event</TableCell>
                <TableCell>Evidence</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {hasEvents ? (
                auditEvents.map((event) => (
                  <TableRow key={event.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{event.time}</TableCell>
                    <TableCell>
                      <Chip label={event.actor} size="small" color={event.tone === "default" ? "default" : event.tone} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {event.subject}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {event.action}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {event.evidence}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Stack spacing={1} sx={{ py: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        No audit events to show yet
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Once workspace activity is available, this page will surface recent lifecycle changes, billing follow-ups, and suspension records.
                      </Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button component={NextLink} href="/dashboard/registry" variant="contained" sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}>
                          Review tenant records
                        </Button>
                        <Button component={NextLink} href="/dashboard/support" variant="outlined" sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}>
                          Check support queue
                        </Button>
                      </Stack>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  );
}
