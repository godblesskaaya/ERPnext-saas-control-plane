"use client";

import type { AuditLogEntry } from "../../../../domains/shared/lib/types";
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
    <div className="rounded-xl border border-slate-700 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Admin audit log</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
            onClick={onExportAudit}
            disabled={auditExportBusy}
          >
            {auditExportBusy ? "Exporting..." : "Export CSV"}
          </button>
          <button className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800" onClick={onRefreshAudit}>
            Refresh
          </button>
        </div>
      </div>
      {auditExportError ? <p className="mb-3 text-sm text-red-400">{auditExportError}</p> : null}

      {!auditSupported ? (
        <p className="text-sm text-slate-300">Audit log endpoint is not available on this backend.</p>
      ) : auditError ? (
        <p className="text-sm text-red-400">{auditError}</p>
      ) : auditLog.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Actor</th>
                <th className="p-2">Action</th>
                <th className="p-2">Resource</th>
                <th className="p-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-700">
                  <td className="p-2 text-xs text-slate-300">{formatDate(entry.created_at)}</td>
                  <td className="p-2 text-xs text-slate-300">{entry.actor_email || entry.actor_id || entry.actor_role}</td>
                  <td className="p-2 text-xs">{entry.action}</td>
                  <td className="p-2 text-xs text-slate-300">
                    {entry.resource}
                    {entry.resource_id ? ` (${entry.resource_id.slice(0, 6)}...)` : ""}
                  </td>
                  <td className="p-2 text-xs text-slate-400">{entry.ip_address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-300">No audit entries yet.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Page {auditPage} of {auditTotalPages} • {auditTotal} events
        </span>
        <div className="flex gap-2">
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
            disabled={auditPage <= 1}
            onClick={onPreviousPage}
          >
            Previous
          </button>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
            disabled={auditPage >= auditTotalPages}
            onClick={onNextPage}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

