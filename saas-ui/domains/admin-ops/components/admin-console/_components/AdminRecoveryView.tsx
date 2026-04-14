"use client";

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
    <div className="rounded-xl border border-slate-700 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Recovery queue (dead-letter)</h2>
        <button className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800" onClick={onRefreshDeadLetters}>
          Refresh
        </button>
      </div>

      {!deadLetterSupported ? (
        <p className="text-sm text-slate-300">Dead-letter endpoint is not available on this backend.</p>
      ) : deadLetterError ? (
        <p className="text-sm text-red-400">{deadLetterError}</p>
      ) : deadLetters.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Worker function</th>
                <th className="p-2">Queued</th>
                <th className="p-2">Args</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {deadLetters.map((job) => (
                <tr key={job.id} className="border-t border-slate-700">
                  <td className="p-2 font-mono text-xs">{job.id}</td>
                  <td className="p-2 text-xs">{job.func_name}</td>
                  <td className="p-2 text-xs text-slate-300">{formatDate(job.enqueued_at)}</td>
                  <td className="p-2 text-xs text-slate-300">
                    <code>{JSON.stringify(job.args).slice(0, 120)}</code>
                  </td>
                  <td className="p-2 text-xs">
                    {canRequeueDeadLetters ? (
                      <button
                        className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
                        disabled={requeueJobId === job.id}
                        onClick={() => onRequeueDeadLetter(job.id)}
                      >
                        {requeueJobId === job.id ? "Requeueing..." : "Requeue"}
                      </button>
                    ) : (
                      <span className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400">Read-only scope</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-300">No dead-letter jobs.</p>
      )}
    </div>
  );
}
