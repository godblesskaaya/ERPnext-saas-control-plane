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
  loadWorkspaceQueueData,
  toWorkspaceQueueErrorMessage,
} from "../../../../../domains/tenant-ops/application/workspaceQueueUseCases";
import { TenantStatusChip } from "../../../../../domains/shared/components/TenantStatusChip";
import { formatTimestamp } from "../../../../../domains/shared/lib/formatters";
import { EmptyState, LoadingState, PageHeader } from "../../../../../domains/shell/components";
import type { Tenant } from "../../../../../domains/shared/lib/types";

type ActivitySummary = {
  active: number;
  pendingPayment: number;
  provisioning: number;
  suspended: number;
  failed: number;
};

type ActivityEntry = {
  id: string;
  tenantName: string;
  tenantPath: string;
  timestamp: string;
  status: string;
  summary: string;
};

function summaryFor(tenants: Tenant[]): ActivitySummary {
  return tenants.reduce<ActivitySummary>(
    (acc, tenant) => {
      const status = tenant.status.toLowerCase();
      if (status === "active") acc.active += 1;
      if (status === "pending_payment") acc.pendingPayment += 1;
      if (["provisioning", "pending", "upgrading", "restoring"].includes(status)) acc.provisioning += 1;
      if (["suspended", "suspended_admin", "suspended_billing"].includes(status)) acc.suspended += 1;
      if (status === "failed") acc.failed += 1;
      return acc;
    },
    { active: 0, pendingPayment: 0, provisioning: 0, suspended: 0, failed: 0 },
  );
}

function entrySummary(status: string): string {
  const value = status.toLowerCase();
  if (value === "active") return "Workspace is live and ready for daily work.";
  if (value === "pending_payment") return "Waiting for payment confirmation.";
  if (["pending", "provisioning"].includes(value)) return "Setup is in progress.";
  if (value === "upgrading") return "Plan upgrade is being applied.";
  if (value === "restoring") return "Restore from backup is running.";
  if (value === "suspended_billing") return "Access paused for billing resolution.";
  if (value === "suspended_admin") return "Access paused by an administrator.";
  if (value === "suspended") return "Access is paused.";
  if (value === "failed") return "Last lifecycle step failed and needs attention.";
  if (value === "pending_deletion" || value === "deleting") return "Deletion is in progress.";
  if (value === "deleted") return "Workspace has been removed.";
  return "Status changed recently.";
}

function buildEntries(tenants: Tenant[]): ActivityEntry[] {
  return [...tenants]
    .sort((a, b) => {
      const left = new Date(a.updated_at || a.created_at).getTime();
      const right = new Date(b.updated_at || b.created_at).getTime();
      return right - left;
    })
    .slice(0, 8)
    .map((tenant) => ({
      id: tenant.id,
      tenantName: tenant.company_name,
      tenantPath: `/app/tenants/${tenant.id}/overview`,
      timestamp: formatTimestamp(tenant.updated_at || tenant.created_at),
      status: tenant.status,
      summary: entrySummary(tenant.status),
    }));
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
          {value.toLocaleString()}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function DashboardActivityPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const feed = await loadWorkspaceQueueData({
          page: 1,
          limit: 12,
          showStatusFilter: false,
          statusFilterValue: "all",
          search: "",
          planFilter: "all",
        });
        if (!active) return;
        setTenants(feed.tenants);
        setTotalTenants(feed.total);
      } catch (err) {
        if (!active) return;
        setError(toWorkspaceQueueErrorMessage(err, "Failed to load workspace activity."));
        setTenants([]);
        setTotalTenants(0);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const entries = useMemo(() => buildEntries(tenants), [tenants]);
  const summary = useMemo(() => summaryFor(tenants), [tenants]);
  const needsAttention =
    summary.pendingPayment + summary.provisioning + summary.suspended + summary.failed;

  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Overview"
        title="Activity"
        subtitle={`${totalTenants.toLocaleString()} workspace${totalTenants === 1 ? "" : "s"} tracked. Recent lifecycle changes are listed below.`}
        actions={
          <Button
            component={NextLink}
            href="/app/tenants"
            variant="outlined"
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Open registry
          </Button>
        }
      />

      {error ? <Alert severity="warning">{error}</Alert> : null}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
        }}
      >
        <MetricCard label="Active" value={summary.active} hint="Ready for daily use." />
        <MetricCard label="Needs attention" value={needsAttention} hint="Billing, setup, or follow-up required." />
        <MetricCard label="Recent updates" value={entries.length} hint="Listed in the timeline below." />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
        <Box sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Recent activity
          </Typography>
          <Typography variant="caption" color="text.secondary">
            The eight most recently changed workspaces.
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ p: 3 }}>
            <LoadingState label="Loading activity…" />
          </Box>
        ) : entries.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <EmptyState
              title="No activity yet"
              description="Lifecycle changes will appear here once workspaces are created or updated."
            />
          </Box>
        ) : (
          <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
            {entries.map((entry) => (
              <Stack
                key={entry.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ sm: "center" }}
                justifyContent="space-between"
                sx={{ px: 3, py: 2 }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography
                      component={NextLink}
                      href={entry.tenantPath}
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: "primary.main", textDecoration: "none" }}
                    >
                      {entry.tenantName}
                    </Typography>
                    <TenantStatusChip status={entry.status} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {entry.summary}
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ flexShrink: 0 }}
                >
                  <Chip size="small" variant="outlined" label={entry.timestamp} />
                  <Button
                    component={NextLink}
                    href={entry.tenantPath}
                    size="small"
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    View →
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
