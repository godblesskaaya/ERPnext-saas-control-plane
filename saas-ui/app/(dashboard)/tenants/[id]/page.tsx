"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { JobLogPanel } from "../../../../domains/shared/components/JobLogPanel";
import { api, getApiErrorMessage, isSessionExpiredError } from "../../../../domains/shared/lib/api";
import type { BackupManifestEntry, Tenant } from "../../../../domains/shared/lib/types";

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-500/20 text-emerald-300";
  if (normalized === "provisioning" || normalized === "pending" || normalized === "deleting") {
    return "bg-amber-500/20 text-amber-300";
  }
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  if (normalized === "deleted") return "bg-slate-500/20 text-slate-300";
  return "bg-sky-500/20 text-sky-300";
}

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

function nextActionByStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "Workspace is live. Confirm users can log in and run first transactions.";
  if (normalized === "pending_payment") return "Complete payment to continue automatic provisioning.";
  if (normalized === "pending" || normalized === "provisioning") return "Provisioning is running. Keep this page open for status updates.";
  if (normalized === "failed") return "Provisioning failed. Review related job logs and retry from dashboard.";
  if (normalized === "suspended") return "Access is suspended. Coordinate with admin team before reactivation.";
  return "Review tenant state and choose the next operational action.";
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const jobId = searchParams.get("job") || undefined;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupManifestEntry[]>([]);
  const [backupsSupported, setBackupsSupported] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const loadTenant = useCallback(async () => {
    if (!id) return;
    try {
      const nextTenant = await api.getTenant(id);
      setTenant(nextTenant);
      setError(null);
    } catch (err) {
      if (isSessionExpiredError(err)) {
        setError("Session expired. Please log in again.");
      } else {
        setError(getApiErrorMessage(err, "Failed to load tenant"));
      }
      setTenant(null);
    }
  }, [id]);

  const retryProvisioning = useCallback(async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const result = await api.retryTenant(id);
      if (!result.supported) {
        setError("Retry endpoint is not available on this backend.");
        return;
      }
      await loadTenant();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to retry provisioning"));
    } finally {
      setRetrying(false);
    }
  }, [id, loadTenant]);

  const loadBackups = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.listTenantBackups(id);
      if (!result.supported) {
        setBackupsSupported(false);
        setBackups([]);
        return;
      }
      setBackupsSupported(true);
      setBackups(result.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load backup history"));
    }
  }, [id]);

  useEffect(() => {
    void loadTenant();
    void loadBackups();
  }, [loadBackups, loadTenant]);

  const sortedBackups = useMemo(
    () => [...backups].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))),
    [backups]
  );

  if (!tenant) {
    return <p>{error ?? "Loading tenant..."}</p>;
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{tenant.company_name}</h1>
            <p>
              Health:{" "}
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(tenant.status)}`}>
                {tenant.status}
              </span>
            </p>
            <p>
              Workspace URL:{" "}
              <a href={`https://${tenant.domain}`} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                {tenant.domain}
              </a>
            </p>
          </div>
          <a
            href={`https://${tenant.domain}`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800"
          >
            Open workspace
          </a>
          {tenant.status.toLowerCase() === "failed" ? (
            <button
              className="rounded border border-amber-500 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
              disabled={retrying}
              onClick={() => void retryProvisioning()}
            >
              {retrying ? "Retrying..." : "Retry provisioning"}
            </button>
          ) : null}
        </div>
        <p className="mt-3 rounded border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
          Next step: {nextActionByStatus(tenant.status)}
        </p>
      </div>

      {jobId ? (
        <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h2 className="text-lg font-semibold">Realtime job progress</h2>
          <JobLogPanel jobId={jobId} />
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Recovery backups</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadBackups();
            }}
          >
            Refresh
          </button>
        </div>

        {!backupsSupported ? (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            Backup history endpoint is not available on this backend yet.
          </p>
        ) : sortedBackups.length ? (
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="p-2 text-left">Created</th>
                  <th className="p-2 text-left">Backup file</th>
                  <th className="p-2 text-left">Size</th>
                  <th className="p-2 text-left">Expires</th>
                </tr>
              </thead>
              <tbody>
                {sortedBackups.map((entry, index) => {
                  const link = resolveBackupDownload(entry);
                  return (
                    <tr key={`${entry.id ?? entry.job_id ?? "backup"}-${index}`} className="border-t border-slate-700">
                      <td className="p-2">{formatTimestamp(typeof entry.created_at === "string" ? entry.created_at : null)}</td>
                      <td className="p-2">
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                            {String(entry.file_path ?? "Download backup")}
                          </a>
                        ) : (
                          <span className="text-slate-400">{String(entry.file_path ?? "Unavailable")}</span>
                        )}
                      </td>
                      <td className="p-2">{typeof entry.file_size_bytes === "number" ? `${entry.file_size_bytes} bytes` : "—"}</td>
                      <td className="p-2">{formatTimestamp(typeof entry.expires_at === "string" ? entry.expires_at : null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            No backup records yet. Trigger a backup from dashboard when you need a restore point.
          </p>
        )}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
