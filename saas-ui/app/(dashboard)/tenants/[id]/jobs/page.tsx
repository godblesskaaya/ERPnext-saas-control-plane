"use client";

import {
  Alert,
  Box,
  Button,
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
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { JobLogPanel } from "../../../../../domains/shared/components/JobLogPanel";
import { loadTenantRecentJobs, toTenantDetailErrorMessage } from "../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { TenantWorkspacePageLayout } from "../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import { useTenantRouteContext } from "../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";
import type { Job } from "../../../../../domains/shared/lib/types";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantJobsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const selectedJobId = searchParams.get("job") || undefined;
  const { tenant, error } = useTenantRouteContext(id);

  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [recentJobsSupported, setRecentJobsSupported] = useState(true);
  const [recentJobsError, setRecentJobsError] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);

  const loadRecentJobsData = useCallback(async () => {
    if (!id) return;
    setJobsLoading(true);
    try {
      const result = await loadTenantRecentJobs(id, 40, 10);
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
    } finally {
      setJobsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadRecentJobsData();
  }, [loadRecentJobsData]);

  const activeRecentJob = useMemo(
    () => recentJobs.find((job) => !TERMINAL_JOB_STATUSES.has((job.status || "").toLowerCase())),
    [recentJobs]
  );
  const liveJobId = selectedJobId || activeRecentJob?.id;

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Jobs"
      tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
      footerError={error}
    >
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Recent jobs
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void loadRecentJobsData();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>

        {jobsLoading ? (
          <Alert severity="info">Loading jobs...</Alert>
        ) : !recentJobsSupported ? (
          <Alert severity="warning">Job history endpoint is not available on this backend yet.</Alert>
        ) : recentJobsError ? (
          <Alert severity="error">{recentJobsError}</Alert>
        ) : recentJobs.length ? (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableHead sx={{ backgroundColor: "grey.50" }}>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{job.type}</TableCell>
                    <TableCell>
                      <Chip label={job.status} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{formatTimestamp(job.created_at)}</TableCell>
                    <TableCell>
                      <Button
                        component="a"
                        href={`/tenants/${id}/jobs?job=${job.id}`}
                        variant="outlined"
                        size="small"
                        sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                      >
                        View logs
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No jobs yet for this tenant.</Alert>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Realtime job progress
        </Typography>
        {liveJobId ? (
          <>
            {!selectedJobId && activeRecentJob ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Auto-following latest active job:{" "}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {activeRecentJob.type}
                </Box>{" "}
                ({activeRecentJob.status})
              </Alert>
            ) : null}
            <Box sx={{ mt: 2 }}>
              <JobLogPanel jobId={liveJobId} />
            </Box>
          </>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            No active jobs right now. Select a recent operation to open logs.
          </Alert>
        )}
      </Paper>

    </TenantWorkspacePageLayout>
  );
}
