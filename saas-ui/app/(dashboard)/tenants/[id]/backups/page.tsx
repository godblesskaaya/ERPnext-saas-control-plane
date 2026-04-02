"use client";

import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadTenantBackupManifest,
  restoreTenantFromBackup,
  toTenantDetailErrorMessage,
} from "../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { useTenantRouteContext } from "../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";
import { TenantSectionLinks } from "../../../../../domains/tenant-ops/ui/tenant-detail/sections";
import type { BackupManifestEntry } from "../../../../../domains/shared/lib/types";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function resolveBackupDownload(entry: BackupManifestEntry): string | null {
  const direct = entry.download_url;
  if (typeof direct === "string" && direct.trim()) return direct;
  const path = entry.file_path;
  if (typeof path === "string" && path.trim()) return path;
  return null;
}

export default function TenantBackupsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { tenant, error } = useTenantRouteContext(id);

  const [backups, setBackups] = useState<BackupManifestEntry[]>([]);
  const [backupsSupported, setBackupsSupported] = useState(true);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<BackupManifestEntry | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  const loadBackupsData = useCallback(async () => {
    if (!id) return;
    setBackupsLoading(true);
    try {
      const result = await loadTenantBackupManifest(id);
      if (!result.supported) {
        setBackupsSupported(false);
        setBackups([]);
        setBackupsError(null);
        return;
      }
      setBackupsSupported(true);
      setBackups(result.data);
      setBackupsError(null);
    } catch (err) {
      setBackupsError(toTenantDetailErrorMessage(err, "Failed to load backup history"));
    } finally {
      setBackupsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadBackupsData();
  }, [loadBackupsData]);

  const sortedBackups = useMemo(
    () => [...backups].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))),
    [backups]
  );

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <Box sx={{ display: "grid", gap: 3, pb: 4 }}>
      <Stack spacing={0.5}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
          Backups
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
        </Typography>
      </Stack>

      <TenantSectionLinks tenantId={id} />

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Recovery backups
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void loadBackupsData();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>

        {backupsLoading ? (
          <Alert severity="info" sx={{ mt: 2 }}>Loading backup history...</Alert>
        ) : !backupsSupported ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Backup history endpoint is not available on this backend yet.
          </Alert>
        ) : backupsError ? (
          <Alert severity="error" sx={{ mt: 2 }}>{backupsError}</Alert>
        ) : sortedBackups.length ? (
          <>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, borderRadius: 3 }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "grey.50" }}>
                  <TableRow>
                    <TableCell>Created</TableCell>
                    <TableCell>Backup file</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedBackups.map((entry, index) => {
                    const link = resolveBackupDownload(entry);
                    return (
                      <TableRow key={`${entry.id ?? entry.job_id ?? "backup"}-${index}`}>
                        <TableCell>{formatTimestamp(typeof entry.created_at === "string" ? entry.created_at : null)}</TableCell>
                        <TableCell>
                          {link ? (
                            <Link href={link} target="_blank" rel="noreferrer" underline="hover" sx={{ color: "#0d6a6a" }}>
                              {String(entry.file_path ?? "Download backup")}
                            </Link>
                          ) : (
                            <Typography variant="body2" color="text.disabled">
                              {String(entry.file_path ?? "Unavailable")}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{typeof entry.file_size_bytes === "number" ? `${entry.file_size_bytes} bytes` : "—"}</TableCell>
                        <TableCell>{formatTimestamp(typeof entry.expires_at === "string" ? entry.expires_at : null)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={!entry.id || restoreBusy}
                            onClick={() => {
                              setRestoreTarget(entry);
                              setRestoreConfirm("");
                              setRestoreError(null);
                              setRestoreNotice(null);
                            }}
                            sx={{ borderRadius: 99, textTransform: "none" }}
                          >
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {restoreTarget ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Confirm restore
                </Typography>
                <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
                  Restoring will overwrite the current tenant database with the selected backup. Type{" "}
                  <Box component="span" sx={{ fontWeight: 700 }}>RESTORE</Box> to continue.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
                  <TextField
                    value={restoreConfirm}
                    onChange={(event) => setRestoreConfirm(event.target.value)}
                    placeholder="RESTORE"
                    size="small"
                  />
                  <Button
                    variant="contained"
                    size="small"
                    disabled={restoreBusy || restoreConfirm.trim().toUpperCase() !== "RESTORE"}
                    onClick={async () => {
                      if (!id || !restoreTarget?.id) return;
                      setRestoreBusy(true);
                      setRestoreError(null);
                      setRestoreNotice(null);
                      try {
                        const result = await restoreTenantFromBackup(id, restoreTarget.id);
                        if (!result.supported) {
                          setRestoreError("Restore endpoint is not available on this backend.");
                          return;
                        }
                        setRestoreNotice("Restore job queued successfully.");
                        setRestoreTarget(null);
                        setRestoreConfirm("");
                      } catch (err) {
                        setRestoreError(toTenantDetailErrorMessage(err, "Failed to queue restore"));
                      } finally {
                        setRestoreBusy(false);
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700, bgcolor: "#0d6a6a" }}
                  >
                    {restoreBusy ? "Queuing..." : "Confirm restore"}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setRestoreTarget(null);
                      setRestoreConfirm("");
                    }}
                    sx={{ borderRadius: 99, textTransform: "none" }}
                  >
                    Cancel
                  </Button>
                </Stack>
                {restoreError ? <Alert severity="error" sx={{ mt: 1 }}>{restoreError}</Alert> : null}
                {restoreNotice ? <Alert severity="success" sx={{ mt: 1 }}>{restoreNotice}</Alert> : null}
              </Alert>
            ) : null}
          </>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            No backup records yet. Trigger a backup from dashboard when you need a restore point.
          </Alert>
        )}
      </Paper>

      {error ? <Alert severity="error">{error}</Alert> : null}
    </Box>
  );
}
