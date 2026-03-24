"use client";

import { JobLogPanel } from "../../../../domains/shared/components/JobLogPanel";
import type { Job } from "../../../../domains/shared/lib/types";
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
    <div className="rounded-xl border border-slate-700 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Execution monitor</h2>
        <button className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800" onClick={onRefreshJobs}>
          Refresh
        </button>
      </div>

      {!jobsSupported ? (
        <p className="text-sm text-slate-300">Admin jobs endpoint is not available on this backend.</p>
      ) : jobsError ? (
        <p className="text-sm text-red-400">{jobsError}</p>
      ) : jobs.length ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="p-2">Job ID</th>
                  <th className="p-2">Tenant ID</th>
                  <th className="p-2">Flow</th>
                  <th className="p-2">Health</th>
                  <th className="p-2">Created</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-slate-700">
                    <td className="p-2 font-mono text-xs">{job.id}</td>
                    <td className="p-2 font-mono text-xs">{job.tenant_id}</td>
                    <td className="p-2 text-xs">{job.type}</td>
                    <td className="p-2 text-xs">{job.status}</td>
                    <td className="p-2 text-xs text-slate-300">{formatDate(job.created_at)}</td>
                    <td className="p-2 text-right">
                      <button
                        className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
                        onClick={() => onInspectJobLogs(job.id)}
                      >
                        Inspect logs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedJob ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-300">
                Showing logs for job <span className="font-mono">{selectedJob.id}</span>
              </p>
              {selectedJobSupported ? (
                <JobLogPanel jobId={selectedJob.id} logs={selectedJob.logs} status={selectedJob.status} />
              ) : (
                <pre className="max-h-72 overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
                  {selectedJob.logs || "No logs available."}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-300">No jobs found. Trigger provisioning or maintenance actions to populate this feed.</p>
      )}
    </div>
  );
}

