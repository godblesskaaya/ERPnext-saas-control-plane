"use client";

import {
  Box,
  Button,
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

import { FeatureUnavailable } from "../../../../shared/components/FeatureUnavailable";
import { JobLogPanel } from "../../../../shared/components/JobLogPanel";
import type { Job } from "../../../../shared/lib/types";
import { formatDate } from "./adminConsoleFormatters";

type AdminJobsViewProps = {
  jobsSupported: boolean;
  jobsError: string | null;
  jobs: Job[];
  selectedJob: Job | null;
  selectedJobSupported: boolean;
  onRefreshJobs: () => void;
  onInspectJobLogs: (jobId: string) => void;
};

export function AdminJobsView({
  jobsSupported,
  jobsError,
  jobs,
  selectedJob,
  selectedJobSupported,
  onRefreshJobs,
  onInspectJobLogs,
}: AdminJobsViewProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Execution monitor
        </Typography>
        <Button size="small" variant="outlined" onClick={onRefreshJobs}>
          Refresh
        </Button>
      </Stack>

      {!jobsSupported ? (
        <FeatureUnavailable feature="Job history" />
      ) : jobsError ? (
        <Typography variant="body2" color="error.main">
          {jobsError}
        </Typography>
      ) : jobs.length ? (
        <Stack spacing={2}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Job ID</TableCell>
                  <TableCell>Tenant ID</TableCell>
                  <TableCell>Flow</TableCell>
                  <TableCell>Health</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id} hover>
                    <TableCell sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>{job.id}</TableCell>
                    <TableCell sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>{job.tenant_id}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{job.type}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{job.status}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{formatDate(job.created_at)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" onClick={() => onInspectJobLogs(job.id)}>
                        Inspect logs
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {selectedJob ? (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Showing logs for job{" "}
                <Box component="span" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {selectedJob.id}
                </Box>
              </Typography>
              {selectedJobSupported ? (
                <JobLogPanel jobId={selectedJob.id} logs={selectedJob.logs} status={selectedJob.status} />
              ) : (
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    maxHeight: 288,
                    overflow: "auto",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    p: 1.5,
                    fontSize: 12,
                  }}
                >
                  {selectedJob.logs || "No logs available."}
                </Box>
              )}
            </Stack>
          ) : null}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No jobs found. Trigger provisioning or maintenance actions to populate this feed.
        </Typography>
      )}
    </Paper>
  );
}
