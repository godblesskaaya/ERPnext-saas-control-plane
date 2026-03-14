"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, getApiErrorMessage, isSessionExpiredError, jobStreamUrl } from "../lib/api";
import { getToken } from "../../auth/auth";
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
  if (normalized === "succeeded" || normalized === "active") return "bg-emerald-100 text-emerald-800";
  if (normalized === "failed") return "bg-red-100 text-red-700";
  if (normalized === "running" || normalized === "provisioning" || normalized === "queued" || normalized === "deleting") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-slate-100 text-slate-600";
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
  const pollingDelayRef = useRef(5000);
  const pollingTimerRef = useRef<number | null>(null);

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
    pollingDelayRef.current = 5000;
    if (pollingTimerRef.current) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
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

    const schedulePoll = () => {
      pollingTimerRef.current = window.setTimeout(async () => {
        try {
          await refreshJob();
        } catch {
          // ignore errors; next poll will retry
        }
        pollingDelayRef.current = Math.min(pollingDelayRef.current * 2, 30000);
        if (!TERMINAL_STATUSES.has(jobStatus.toLowerCase()) && streamState !== "live") {
          schedulePoll();
        }
      }, pollingDelayRef.current);
    };

    if (streamState !== "live") {
      schedulePoll();
    }

    return () => {
      if (pollingTimerRef.current) {
        window.clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [isTerminal, jobId, refreshJob, jobStatus, streamState]);

  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-white/90 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 font-medium ${statusBadgeClass(jobStatus)}`}>{jobStatus}</span>
          {jobId ? <span className="text-slate-500">Job {jobId.slice(0, 8)}...</span> : null}
          {jobId ? <span className="text-slate-500">Stream: {streamState}</span> : null}
          <span className="text-slate-500">Lines: {logLines.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-full border border-amber-200 px-2 py-1 text-slate-700 hover:border-amber-300"
            onClick={() => {
              void refreshJob().catch(() => undefined);
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-full border border-amber-200 px-2 py-1 text-slate-700 hover:border-amber-300"
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

      <pre className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-amber-50">
        {logLines.length ? logLines.join("\n") : "No logs yet."}
      </pre>

      {error ? <p className="text-xs text-amber-700">{error}</p> : null}
    </div>
  );
}
