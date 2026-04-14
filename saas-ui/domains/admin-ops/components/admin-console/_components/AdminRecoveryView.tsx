"use client";

import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import type { DeadLetterJob } from "../../../../shared/lib/types";
import { formatDate } from "./adminConsoleFormatters";

type AdminRecoveryViewProps = {
  deadLetterSupported: boolean;
  deadLetterError: string | null;
  deadLetters: DeadLetterJob[];
  requeueJobId: string | null;
  canRequeueDeadLetters?: boolean;
  onRefreshDeadLetters: () => void;
  onRequeueDeadLetter: (jobId: string) => void;
};

export function AdminRecoveryView({
  deadLetterSupported,
  deadLetterError,
  deadLetters,
  requeueJobId,
  canRequeueDeadLetters = true,
  onRefreshDeadLetters,
  onRequeueDeadLetter,
}: AdminRecoveryViewProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Recovery queue (dead-letter)
        </Typography>
        <Button size="small" variant="outlined" onClick={onRefreshDeadLetters}>
          Refresh
        </Button>
      </Box>

      {!deadLetterSupported ? (
        <Typography variant="body2" color="text.secondary">
          Dead-letter endpoint is not available on this backend.
        </Typography>
      ) : deadLetterError ? (
        <Typography variant="body2" color="error.main">
          {deadLetterError}
        </Typography>
      ) : deadLetters.length ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Worker function</TableCell>
                <TableCell>Queued</TableCell>
                <TableCell>Args</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {deadLetters.map((job) => (
                <TableRow key={job.id} hover>
                  <TableCell sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>{job.id}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{job.func_name}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{formatDate(job.enqueued_at)}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>
                    <Box component="code">{JSON.stringify(job.args).slice(0, 120)}</Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {canRequeueDeadLetters ? (
                      <Button size="small" variant="outlined" disabled={requeueJobId === job.id} onClick={() => onRequeueDeadLetter(job.id)}>
                        {requeueJobId === job.id ? "Requeueing..." : "Requeue"}
                      </Button>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Read-only scope
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No dead-letter jobs.
        </Typography>
      )}
    </Paper>
  );
}
