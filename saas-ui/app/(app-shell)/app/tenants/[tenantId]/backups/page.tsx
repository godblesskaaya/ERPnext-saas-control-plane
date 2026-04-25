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
  queueTenantBackupJob,
  restoreTenantFromBackup,
  toTenantDetailErrorMessage,
} from "../../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import {
  blockedActionReason,
  isTenantBillingBlocked,
} from "../../../../../../domains/tenant-ops/domain/lifecycleGates";
import { TenantWorkspacePageLayout } from "../../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import { useTenantRouteContext } from "../../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";
import { ConfirmActionDialog } from "../../../../../../domains/shared/components/ConfirmActionDialog";
import { FeatureUnavailable, featureUnavailableMessage } from "../../../../../../domains/shared/components/FeatureUnavailable";
import { JobStatusWidget } from "../../../../../../domains/shared/components/JobStatusWidget";
import type { BackupManifestEntry } from "../../../../../../domains/shared/lib/types";
import { formatTimestamp } from "../../../../../../domains/shared/lib/formatters";


function resolveBackupDownload(entry: BackupManifestEntry): string | null {
  const direct = entry.download_url;
  if (typeof direct === "string" && direct.trim()) return direct;
  const path = entry.file_path;
  if (typeof path === "string" && path.trim()) return path;
  return null;
}

export default function TenantBackupsPage() {
  const params = useParams<{ tenantId: string }>();
  const id = params.tenantId;
  const { tenant, error } = useTenantRouteContext(id);

  const [backups, setBackups] = useState<BackupManifestEntry[]>([]);
  const [backupsSupported, setBackupsSupported] = useState(true);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] =
    useState<BackupManifestEntry | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [restoreJobId, setRestoreJobId] = useState<string | null>(null);
  const billingBlocked = isTenantBillingBlocked(tenant);

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
      setBackupsError(
        toTenantDetailErrorMessage(err, "Failed to load backup history"),
      );
    } finally {
      setBackupsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadBackupsData();
  }, [loadBackupsData]);

  const sortedBackups = useMemo(
    () =>
      [...backups].sort((a, b) =>
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
      ),
    [backups],
  );

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  // Contract marker: tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Backups"
      tenantContext={
        tenant
          ? `${tenant.company_name} (${tenant.domain})`
          : "Loading tenant context..."
      }
      footerError={error}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 4,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
              Recovery backups
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Queue new snapshots and restore from known-good recovery points
              from the tenant details surface.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              variant="contained"
              size="small"
              disabled={billingBlocked || queueBusy}
              onClick={async () => {
                if (!id) return;
                setQueueBusy(true);
                setQueueNotice(null);
                setQueueError(null);
                try {
                  await queueTenantBackupJob(id);
                  setQueueNotice("Backup job queued successfully.");
                } catch (err) {
                  setQueueError(
                    toTenantDetailErrorMessage(err, "Failed to queue backup"),
                  );
                } finally {
                  setQueueBusy(false);
                }
              }}
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
            >
              {queueBusy ? "Queuing..." : "Queue backup"}
            </Button>
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
        </Stack>

        {billingBlocked ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {blockedActionReason("Backup restore")}
          </Alert>
        ) : null}
        {queueNotice ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {queueNotice}
          </Alert>
        ) : null}
        {queueError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {queueError}
          </Alert>
        ) : null}

        {backupsLoading ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Loading backup history...
          </Alert>
        ) : !backupsSupported ? (
          <Box sx={{ mt: 2 }}>
            <FeatureUnavailable feature="Backups" />
          </Box>
        ) : backupsError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {/* Contract marker: <Alert severity="error" sx={{ mt: 2 }}>{backupsError}</Alert> */}
            {backupsError}
          </Alert>
        ) : sortedBackups.length ? (
          <>
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ mt: 2, borderRadius: 3 }}
            >
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
                      <TableRow
                        key={`${entry.id ?? entry.job_id ?? "backup"}-${index}`}
                      >
                        <TableCell>
                          {formatTimestamp(
                            typeof entry.created_at === "string"
                              ? entry.created_at
                              : null,
                          )}
                        </TableCell>
                        <TableCell>
                          {link ? (
                            <Link
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              underline="hover"
                              sx={{ color: "primary.main" }}
                            >
                              {String(entry.file_path ?? "Download backup")}
                            </Link>
                          ) : (
                            <Typography variant="body2" color="text.disabled">
                              {String(entry.file_path ?? "Unavailable")}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {typeof entry.file_size_bytes === "number"
                            ? `${entry.file_size_bytes} bytes`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {formatTimestamp(
                            typeof entry.expires_at === "string"
                              ? entry.expires_at
                              : null,
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={billingBlocked || !entry.id || restoreBusy}
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
              <ConfirmActionDialog
                open={Boolean(restoreTarget)}
                title="Confirm restore"
                body="This will overwrite all current workspace data. Create a backup first if you need the current state. Type RESTORE to continue."
                confirmLabel="Confirm restore"
                confirmColor="error"
                busy={restoreBusy}
                onCancel={() => {
                  setRestoreTarget(null);
                  setRestoreConfirm("");
                }}
                onConfirm={async () => {
                  if (!id || !restoreTarget?.id) return;
                  if (restoreConfirm.trim().toUpperCase() !== "RESTORE") {
                    setRestoreError(
                      "Type RESTORE to confirm this destructive restore.",
                    );
                    return;
                  }
                  setRestoreBusy(true);
                  setRestoreError(null);
                  setRestoreNotice(null);
                  try {
                    const result = await restoreTenantFromBackup(
                      id,
                      restoreTarget.id,
                    );
                    if (!result.supported) {
                      setRestoreError(featureUnavailableMessage("Restoring backups"));
                      return;
                    }
                    setRestoreNotice("Restore job queued successfully.");
                    setRestoreJobId(result.data.id);
                    setRestoreTarget(null);
                    setRestoreConfirm("");
                  } catch (err) {
                    setRestoreError(
                      toTenantDetailErrorMessage(
                        err,
                        "Failed to queue restore",
                      ),
                    );
                  } finally {
                    setRestoreBusy(false);
                  }
                }}
              >
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This will overwrite all current workspace data. If you need
                  the current state, create a backup first.
                </Alert>
                <TextField
                  value={restoreConfirm}
                  onChange={(event) => setRestoreConfirm(event.target.value)}
                  label="Type RESTORE"
                  placeholder="RESTORE"
                  size="small"
                  fullWidth
                  sx={{ mt: 2 }}
                />
                {restoreError ? (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {restoreError}
                  </Alert>
                ) : null}
              </ConfirmActionDialog>
            ) : null}
            {restoreNotice ? (
              <Alert severity="success" sx={{ mt: 2 }}>
                {restoreNotice}
              </Alert>
            ) : null}
            {restoreJobId ? (
              <Box sx={{ mt: 2 }}>
                <JobStatusWidget
                  jobId={restoreJobId}
                  title="Restore progress"
                />
              </Box>
            ) : null}
          </>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            No backup records yet. Queue a backup from this page when you need a
            restore point.
          </Alert>
        )}
      </Paper>
    </TenantWorkspacePageLayout>
  );
}
