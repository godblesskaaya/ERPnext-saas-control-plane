"use client";

import { useEffect, useMemo, useState } from "react";

import {
  exportAdminAuditCsv,
  loadAdminAuditLog,
  loadAdminMetrics,
  toAdminErrorMessage,
} from "../../../../domains/admin-ops/application/adminUseCases";
import type { AuditLogEntry, MetricsSummary } from "../../../../domains/shared/lib/types";

type AuditState = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
};

const defaultAuditState: AuditState = { entries: [], total: 0, page: 1, limit: 25 };

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function metricCard(label: string, value: string | number, hint: string, tone: "default" | "warn" = "default") {
  const toneClass =
    tone === "warn" ? "border-slate-200 bg-slate-50 text-slate-900" : "border-slate-200 bg-white text-slate-900";

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{hint}</p>
    </article>
  );
}

export default function DashboardAuditPage() {
  const [audit, setAudit] = useState<AuditState>(defaultAuditState);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsSupported, setMetricsSupported] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const [auditResult, metricsResult] = await Promise.all([
        loadAdminAuditLog(page, audit.limit),
        loadAdminMetrics(),
      ]);
      if (auditResult.supported) {
        setAudit({
          entries: auditResult.entries,
          total: auditResult.total,
          page,
          limit: audit.limit,
        });
      } else {
        setError("Audit log is not enabled on this backend.");
      }

      if (metricsResult.supported) {
        setMetrics(metricsResult.metrics);
      } else {
        setMetricsSupported(false);
      }
    } catch (err) {
      setError(toAdminErrorMessage(err, "Failed to load audit log."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(audit.total / audit.limit));
  const pageLabel = `${audit.page} / ${totalPages}`;

  const latestEntries = useMemo(() => audit.entries.slice(0, 10), [audit.entries]);

  const exportAudit = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportAdminAuditCsv(500);
    } catch (err) {
      setExportError(toAdminErrorMessage(err, "Failed to export audit log."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Audit & policy</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Audit, compliance, and policy checks</h1>
        <p className="mt-2 text-sm text-slate-600">
          Review operator actions, billing interventions, and system policy events for enterprise readiness.
        </p>
      </div>

      {metrics ? (
        <div className="grid gap-3 md:grid-cols-4">
          {metricCard("Jobs last 24h", metrics.jobs_last_24h, "Recent automated actions across the platform")}
          {metricCard(
            "Provisioning success",
            `${metrics.provisioning_success_rate_7d}%`,
            "7-day success rate",
            metrics.provisioning_success_rate_7d < 90 ? "warn" : "default"
          )}
          {metricCard("Dead-letter jobs", metrics.dead_letter_count, "Jobs needing manual intervention", "warn")}
          {metricCard("Suspended tenants", metrics.suspended_tenants, "Policy + billing suspensions")}
        </div>
      ) : metricsSupported ? null : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
          Metrics are not enabled on this backend yet.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Audit trail</p>
              <p className="text-xs text-slate-500">Latest platform events and operator actions.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                onClick={() => void load(audit.page)}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              <button
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-slate-300 disabled:opacity-60"
                onClick={() => {
                  void exportAudit();
                }}
                disabled={exporting}
              >
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {exportError ? <p className="mt-2 text-sm text-red-600">{exportError}</p> : null}

          <div className="mt-4 space-y-3 text-sm text-slate-700">
            {latestEntries.length ? (
              latestEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200/70 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{formatDate(entry.created_at)}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{entry.action}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {entry.actor_email ?? "System"} · {entry.actor_role}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">
                    {entry.resource} {entry.resource_id ? `• ${entry.resource_id}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200/70 bg-white p-4 text-sm text-slate-600">
                Audit log entries will appear once policy actions start flowing.
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-slate-500">
            <span>Total entries: {audit.total}</span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                disabled={audit.page <= 1 || loading}
                onClick={() => void load(audit.page - 1)}
              >
                Prev
              </button>
              <span>{pageLabel}</span>
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1"
                disabled={audit.page >= totalPages || loading}
                onClick={() => void load(audit.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6">
          <p className="text-sm font-semibold text-slate-900">Policy checklist</p>
          <p className="mt-2 text-sm text-slate-600">
            Track compliance guardrails for enterprise readiness across Tanzania deployments.
          </p>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="rounded-2xl border border-slate-200/70 bg-slate-50 p-3">
              ✅ HSTS enforced on tenant domains.
            </li>
            <li className="rounded-2xl border border-slate-200/70 bg-white p-3">
              ✅ Audit log append-only events for admin actions.
            </li>
            <li className="rounded-2xl border border-slate-200/70 bg-white p-3">
              ⏳ Verify backup retention and restore drills for regulated clients.
            </li>
            <li className="rounded-2xl border border-slate-200/70 bg-white p-3">
              ⏳ Confirm support SLAs and escalation paths for enterprise accounts.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
