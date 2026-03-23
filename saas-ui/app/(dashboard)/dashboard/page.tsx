"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { dashboardNavSections } from "../../../domains/dashboard/domain/navigation";
import { api } from "../../../domains/shared/lib/api";
import type { MetricsSummary } from "../../../domains/shared/lib/types";

type EndpointState = "loading" | "ok" | "unsupported" | "unavailable";

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

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [authState, setAuthState] = useState<EndpointState>("loading");
  const [billingState, setBillingState] = useState<EndpointState>("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api.getAdminMetrics();
        if (!active) return;
        if (result.supported) {
          setMetrics(result.data);
        } else {
          // AGENT-NOTE: metrics endpoint can be absent on older deployments. Keep the hub usable with graceful fallback.
          setMetrics(null);
        }
      } catch {
        if (active) {
          setMetrics(null);
        }
      } finally {
        if (active) {
          setMetricsLoading(false);
        }
      }

      try {
        const auth = await api.authHealth();
        if (!active) return;
        setAuthState(auth.supported ? "ok" : "unsupported");
      } catch {
        if (active) setAuthState("unavailable");
      }

      try {
        const billing = await api.billingHealth();
        if (!active) return;
        setBillingState(billing.supported ? "ok" : "unsupported");
      } catch {
        if (active) setBillingState("unavailable");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const journeyCards = useMemo(
    () => [
      {
        title: "Payment onboarding",
        description: "Track tenants waiting for payment completion and onboarding approval.",
        href: "/dashboard/onboarding",
        value: metrics?.pending_payment_tenants,
      },
      {
        title: "Provisioning queue",
        description: "Monitor deployments, retries, and in-progress tenant jobs.",
        href: "/dashboard/provisioning",
        value: metrics?.provisioning_tenants,
      },
      {
        title: "Failures & incidents",
        description: "Resolve failed provisioning and blocked lifecycle transitions.",
        href: "/dashboard/incidents",
        value: metrics?.failed_tenants,
      },
      {
        title: "Billing operations",
        description: "Manage overdue invoices, dunning cycle, and billing recovery.",
        href: "/dashboard/billing-ops",
        value: metrics?.suspended_tenants,
      },
    ],
    [metrics]
  );

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Journey hub</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900">Operations command center</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Route work by lifecycle stage: onboarding, provisioning, billing recovery, support, and governance.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {journeyCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 transition hover:border-amber-200 hover:bg-amber-50"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">Queue</p>
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
        {dashboardNavSections.map((section) => {
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
