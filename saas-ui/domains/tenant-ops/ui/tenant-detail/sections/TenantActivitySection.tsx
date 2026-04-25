"use client";

import { Alert, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";

import { FeatureUnavailable } from "../../../../shared/components/FeatureUnavailable";
import type { AuditLogEntry } from "../../../../shared/lib/types";

type TenantActivitySectionProps = {
  auditSupported: boolean;
  auditError: string | null;
  auditLog: AuditLogEntry[];
  auditPage: number;
  auditTotalPages: number;
  auditTotal: number;
  onRefresh: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  formatTimestamp: (value?: string | null) => string;
};

export function TenantActivitySection({
  auditSupported,
  auditError,
  auditLog,
  auditPage,
  auditTotalPages,
  auditTotal,
  onRefresh,
  onPreviousPage,
  onNextPage,
  canGoPrevious,
  canGoNext,
  formatTimestamp,
}: TenantActivitySectionProps) {
  return (
    <Paper id="activity" variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Activity log
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={onRefresh}
          sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
        >
          Refresh
        </Button>
      </Stack>

      {!auditSupported ? (
        <FeatureUnavailable feature="Activity log" />
      ) : auditError ? (
        <Alert severity="error">{auditError}</Alert>
      ) : auditLog.length ? (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead sx={{ backgroundColor: "grey.50" }}>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>IP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditLog.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatTimestamp(entry.created_at)}</TableCell>
                  <TableCell>{entry.actor_email || entry.actor_id || entry.actor_role}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.ip_address || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info">
          No activity recorded yet.
        </Alert>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Page {auditPage} of {auditTotalPages} • {auditTotal} events
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            disabled={!canGoPrevious}
            onClick={onPreviousPage}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Previous
          </Button>
          <Button
            variant="outlined"
            size="small"
            disabled={!canGoNext}
            onClick={onNextPage}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Next
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
