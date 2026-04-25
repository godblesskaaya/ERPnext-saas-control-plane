"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";

import { api, getApiErrorMessage } from "../lib/api";
import { formatTimestamp } from "../lib/formatters";
import { isTerminalJobStatus } from "../lib/tenantDisplayUtils";
import type { Job } from "../lib/types";

type JobStatusWidgetProps = {
  jobId: string;
  title?: string;
};

export function JobStatusWidget({
  jobId,
  title = "Queued job status",
}: JobStatusWidgetProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadJob = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const nextJob = await api.getJob(jobId);
      setJob(nextJob);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load job status."));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  useEffect(() => {
    if (!jobId || (job && isTerminalJobStatus(job.status))) return;
    const timer = window.setInterval(() => {
      void loadJob();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [job, jobId, loadJob]);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
      >
        <div>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Job {jobId}
          </Typography>
        </div>
        <Button
          size="small"
          variant="outlined"
          disabled={loading}
          onClick={() => void loadJob()}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </Stack>
      {error ? (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      ) : null}
      {job ? (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Typography variant="body2">
            Status: <strong>{job.status}</strong>
            {!isTerminalJobStatus(job.status) ? " · polling every 5s" : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Type: {job.type} · Created: {formatTimestamp(job.created_at)}
          </Typography>
          {job.error ? <Alert severity="error">{job.error}</Alert> : null}
        </Stack>
      ) : !error ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Loading job status...
        </Typography>
      ) : null}
    </Paper>
  );
}
