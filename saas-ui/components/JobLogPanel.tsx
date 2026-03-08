"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, getApiErrorMessage, isSessionExpiredError, jobStreamUrl } from "../lib/api";
import { getToken } from "../lib/auth";
import type { Job } from "../lib/types";

type Props = {
  jobId?: string;
  logs?: string;
  status?: string;
  onJobUpdate?: (job: Job) => void;
};

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "succeeded" || normalized === "active") return "bg-emerald-500/20 text-emerald-300";
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  if (normalized === "running" || normalized === "provisioning" || normalized === "queued" || normalized === "deleting") {
    return "bg-amber-500/20 text-amber-300";
  }
  return "bg-slate-600/30 text-slate-200";
}

function splitLogs(logs?: string): string[] {
  if (!logs) return [];
  return logs
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-300);
}

export function JobLogPanel({ jobId, logs, status, onJobUpdate }: Props) {
  const [logLines, setLogLines] = useState<string[]>(() => splitLogs(logs));
  const [jobStatus, setJobStatus] = useState(status ?? "unknown");
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "live" | "completed" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isTerminal = useMemo(() => TERMINAL_STATUSES.has(jobStatus.toLowerCase()), [jobStatus]);

  const appendLine = useCallback((line: string) => {
    const trimmed = line.trimEnd();
    if (!trimmed) return;
    setLogLines((prev) => {
      const next = [...prev, trimmed];
      return next.slice(-300);
    });
  }, []);

  const refreshJob = useCallback(async () => {
    if (!jobId) return;
    const latest = await api.getJob(jobId);
    setJobStatus(latest.status || "unknown");
    if (latest.logs) {
      setLogLines(splitLogs(latest.logs));
    }
    onJobUpdate?.(latest);
  }, [jobId, onJobUpdate]);

  useEffect(() => {
    setLogLines(splitLogs(logs));
    setJobStatus(status ?? "unknown");
    setStreamState(jobId ? "connecting" : "idle");
    setError(null);
  }, [jobId, logs, status]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    void api
      .getJob(jobId)
      .then((latest) => {
        if (cancelled) return;
        setJobStatus(latest.status || "unknown");
        if (latest.logs) {
          setLogLines(splitLogs(latest.logs));
        }
        onJobUpdate?.(latest);
      })
      .catch((err) => {
        if (cancelled || isSessionExpiredError(err)) return;
        setError(getApiErrorMessage(err, "Failed to load job details"));
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, onJobUpdate]);

  useEffect(() => {
    if (!jobId || isTerminal) {
      return;
    }

    const token = getToken();
    if (!token) {
      setStreamState("error");
      setError("Missing auth token for live stream.");
      return;
    }

    const ws = new WebSocket(jobStreamUrl(jobId), [`bearer.${token}`]);
    setStreamState("connecting");

    ws.onopen = () => {
      setStreamState("live");
      setError(null);
    };

    ws.onmessage = (event) => {
      const text = String(event.data ?? "");
      if (text === "__DONE__") {
        setStreamState("completed");
        void refreshJob().catch(() => undefined);
        ws.close();
        return;
      }
      appendLine(text);
    };

    ws.onerror = () => {
      setStreamState("error");
      setError((previous) => previous ?? "Live stream unavailable. Falling back to polling.");
    };

    ws.onclose = () => {
      setStreamState((prev) => (prev === "completed" ? prev : "error"));
    };

    return () => {
      ws.close();
    };
  }, [appendLine, isTerminal, jobId, refreshJob]);

  useEffect(() => {
    if (!jobId || isTerminal) return;

    const interval = window.setInterval(() => {
      void refreshJob().catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [isTerminal, jobId, refreshJob]);

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 font-medium ${statusBadgeClass(jobStatus)}`}>{jobStatus}</span>
          {jobId ? <span className="text-slate-400">Job {jobId.slice(0, 8)}...</span> : null}
          {jobId ? <span className="text-slate-500">Stream: {streamState}</span> : null}
          <span className="text-slate-500">Lines: {logLines.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
            onClick={() => {
              void refreshJob().catch(() => undefined);
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(logLines.join("\n"));
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy logs"}
          </button>
        </div>
      </div>

      <pre className="max-h-72 overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
        {logLines.length ? logLines.join("\n") : "No logs yet."}
      </pre>

      {error ? <p className="text-xs text-amber-300">{error}</p> : null}
    </div>
  );
}
