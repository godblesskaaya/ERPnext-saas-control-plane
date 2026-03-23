"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  loadDashboardMetricsSnapshot,
  loadDashboardServiceHealthSnapshot,
  type DashboardEndpointState,
} from "../../../domains/dashboard/application/dashboardUseCases";
import {
  defaultDashboardNavMode,
  getDashboardNavSectionsByMode,
  type DashboardNavMode,
} from "../../../domains/dashboard/domain/navigation";
import type { MetricsSummary } from "../../../domains/shared/lib/types";

type EndpointState = "loading" | DashboardEndpointState;
type JourneyCard = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  value?: number;
};

function renderMetric(value: number | undefined, loading: boolean): string {
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return loading ? "…" : "—";
}

function statusClass(state: EndpointState): string {
  if (state === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (state === "unsupported") return "border-amber-200 bg-amber-50 text-amber-900";
  if (state === "unavailable") return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-white text-slate-700";
}

const modeConfig: Record<DashboardNavMode, { label: string; title: string; description: string; switchHint: string }> = {
  operations: {
    label: "Operations",
    title: "Operations command center",
    description: "Route work by lifecycle stage: onboarding, provisioning, billing recovery, support, and governance.",
    switchHint: "Queue-driven routing across onboarding, incidents, billing, and support.",
  },
  workspace: {
    label: "Workspace",
    title: "Workspace command center",
    description:
      "Run tenant-facing journeys: workspace overview, registry, active fleet, billing visibility, and account context.",
    switchHint: "Tenant-level and account-level routing for focused workspace actions.",
  },
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [authState, setAuthState] = useState<EndpointState>("loading");
  const [billingState, setBillingState] = useState<EndpointState>("loading");
  const [mode, setMode] = useState<DashboardNavMode>(defaultDashboardNavMode);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [nextMetrics, health] = await Promise.all([
        loadDashboardMetricsSnapshot(),
        loadDashboardServiceHealthSnapshot(),
      ]);
      if (!active) return;
      // AGENT-NOTE: metrics endpoint can be absent on older deployments. Keep the hub usable with graceful fallback.
      setMetrics(nextMetrics);
      setMetricsLoading(false);
      setAuthState(health.auth.state);
      setBillingState(health.billing.state);
    })().catch(() => {
      if (!active) return;
      setMetrics(null);
      setMetricsLoading(false);
      setAuthState("unavailable");
      setBillingState("unavailable");
    });

    return () => {
      active = false;
    };
  }, []);

  const sectionsByMode = useMemo<Record<DashboardNavMode, ReturnType<typeof getDashboardNavSectionsByMode>>>(
    () => ({
      operations: getDashboardNavSectionsByMode("operations"),
      workspace: getDashboardNavSectionsByMode("workspace"),
    }),
    []
  );

  const journeyCardsByMode = useMemo<Record<DashboardNavMode, JourneyCard[]>>(
    () => ({
      operations: [
        {
          eyebrow: "Queue",
          title: "Payment onboarding",
          description: "Track tenants waiting for payment completion and onboarding approval.",
          href: "/dashboard/onboarding",
          value: metrics?.pending_payment_tenants,
        },
        {
          eyebrow: "Queue",
          title: "Provisioning queue",
          description: "Monitor deployments, retries, and in-progress tenant jobs.",
          href: "/dashboard/provisioning",
          value: metrics?.provisioning_tenants,
        },
        {
          eyebrow: "Queue",
          title: "Failures & incidents",
          description: "Resolve failed provisioning and blocked lifecycle transitions.",
          href: "/dashboard/incidents",
          value: metrics?.failed_tenants,
        },
        {
          eyebrow: "Queue",
          title: "Billing operations",
          description: "Manage overdue invoices, dunning cycle, and billing recovery.",
          href: "/dashboard/billing-ops",
          value: metrics?.suspended_tenants,
        },
      ],
      workspace: [
        {
          eyebrow: "Workspace",
          title: "Workspace overview",
          description: "Start from a consolidated summary of tenant and platform activity.",
          href: "/dashboard/overview",
          value: metrics?.jobs_last_24h,
        },
        {
          eyebrow: "Workspace",
          title: "Tenant registry",
          description: "Search workspaces and open tenant-level control pages.",
          href: "/dashboard/registry",
          value: metrics?.total_tenants,
        },
        {
          eyebrow: "Workspace",
          title: "Active workspaces",
          description: "Review live tenants and continue routine workspace operations.",
          href: "/dashboard/active",
          value: metrics?.active_tenants,
        },
        {
          eyebrow: "Workspace",
          title: "Billing workspace",
          description: "Open invoice analytics and customer billing visibility workflows.",
          href: "/dashboard/billing-details",
          value: metrics?.pending_payment_tenants,
        },
      ],
    }),
    [metrics]
  );

  const activeModeConfig = modeConfig[mode];
  const journeyCards = journeyCardsByMode[mode];
  const visibleSections = sectionsByMode[mode];

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Journey hub</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900">{activeModeConfig.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{activeModeConfig.description}</p>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context mode</p>
          <div className="inline-flex w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-100/70 p-1">
            {(Object.keys(modeConfig) as DashboardNavMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={
                  "flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition " +
                  (mode === option
                    ? "border border-amber-200 bg-white text-amber-800 shadow-sm"
                    : "text-slate-600 hover:text-slate-900")
                }
                aria-pressed={mode === option}
              >
                {modeConfig[option].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{activeModeConfig.switchHint}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {journeyCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 transition hover:border-amber-200 hover:bg-amber-50"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.eyebrow}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{card.title}</p>
            <p className="mt-1 text-xs text-slate-500">{card.description}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{renderMetric(card.value, metricsLoading)}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Platform snapshot</p>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Active tenants</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{renderMetric(metrics?.active_tenants, metricsLoading)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tenants total</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{renderMetric(metrics?.total_tenants, metricsLoading)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Jobs (24h)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{renderMetric(metrics?.jobs_last_24h, metricsLoading)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Endpoint health</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <article className={`rounded-2xl border px-4 py-3 text-xs ${statusClass("ok")}`}>
            API <span className="ml-2 font-semibold">ok</span>
          </article>
          <article className={`rounded-2xl border px-4 py-3 text-xs ${statusClass(authState)}`}>
            Auth <span className="ml-2 font-semibold">{authState}</span>
          </article>
          <article className={`rounded-2xl border px-4 py-3 text-xs ${statusClass(billingState)}`}>
            Billing <span className="ml-2 font-semibold">{billingState}</span>
          </article>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleSections.map((section) => {
          const links = section.items.filter((item) => item.href !== "/dashboard");
          return (
            <section key={section.title} className="rounded-3xl border border-amber-200/70 bg-white/80 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{section.title}</p>
              <p className="mt-1 text-xs text-slate-600">{section.description}</p>
              <div className="mt-3 grid gap-2">
                {links.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-amber-200 hover:bg-amber-50"
                  >
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.hint}</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
