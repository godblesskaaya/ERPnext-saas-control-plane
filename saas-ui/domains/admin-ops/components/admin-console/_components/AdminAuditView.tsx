"use client";

import {
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
import type { AuditLogEntry } from "../../../../shared/lib/types";
import { formatDate } from "./adminConsoleFormatters";

type AdminAuditViewProps = {
  auditExportBusy: boolean;
  auditExportError: string | null;
  onExportAudit: () => void;
  onRefreshAudit: () => void;
  auditSupported: boolean;
  auditError: string | null;
  auditLog: AuditLogEntry[];
  auditPage: number;
  auditTotalPages: number;
  auditTotal: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function AdminAuditView({
  auditExportBusy,
  auditExportError,
  onExportAudit,
  onRefreshAudit,
  auditSupported,
  auditError,
  auditLog,
  auditPage,
  auditTotalPages,
  auditTotal,
  onPreviousPage,
  onNextPage,
}: AdminAuditViewProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.5} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Admin audit log
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={onExportAudit} disabled={auditExportBusy}>
            {auditExportBusy ? "Exporting..." : "Export CSV"}
          </Button>
          <Button size="small" variant="outlined" onClick={onRefreshAudit}>
            Refresh
          </Button>
        </Stack>
      </Stack>
      {auditExportError ? (
        <Typography variant="body2" color="error.main" sx={{ mb: 1.5 }}>
          {auditExportError}
        </Typography>
      ) : null}

      {!auditSupported ? (
        <FeatureUnavailable feature="Audit log" />
      ) : auditError ? (
        <Typography variant="body2" color="error.main">
          {auditError}
        </Typography>
      ) : auditLog.length ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>IP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditLog.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{formatDate(entry.created_at)}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{entry.actor_email || entry.actor_id || entry.actor_role}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{entry.action}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>
                    {entry.resource}
                    {entry.resource_id ? ` (${entry.resource_id.slice(0, 6)}...)` : ""}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{entry.ip_address || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No audit entries yet.
        </Typography>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5} sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Page {auditPage} of {auditTotalPages} • {auditTotal} events
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" disabled={auditPage <= 1} onClick={onPreviousPage}>
            Previous
          </Button>
          <Button size="small" variant="outlined" disabled={auditPage >= auditTotalPages} onClick={onNextPage}>
            Next
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
