"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; hint: string };
type NavSection = { title: string; description: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: "Tenant lifecycle",
    description: "Provisioning state, tenant health, and active operations.",
    items: [
      { href: "/dashboard/overview", label: "Operations overview", hint: "Live platform snapshot" },
      { href: "/dashboard/registry", label: "Tenant directory", hint: "Search & tenant registry" },
      { href: "/dashboard/onboarding", label: "Payment onboarding", hint: "Pending payment state" },
      { href: "/dashboard/provisioning", label: "Provisioning jobs", hint: "Deploying & upgrade queue" },
      { href: "/dashboard/incidents", label: "Failed provisioning", hint: "Incidents and failures" },
      { href: "/dashboard/suspensions", label: "Suspensions", hint: "Billing/admin suspends" },
      { href: "/dashboard/active", label: "Active tenants", hint: "Live tenants list" },
      { href: "/dashboard/activity", label: "Jobs & activity", hint: "Operational event stream" },
    ],
  },
  {
    title: "Billing & finance",
    description: "Plans, invoices, collections, and payment channels.",
    items: [
      { href: "/dashboard/billing-ops", label: "Billing operations", hint: "Dunning queue" },
      { href: "/dashboard/billing", label: "Billing follow-ups", hint: "Pending payments" },
      { href: "/dashboard/billing-details", label: "Billing analytics", hint: "Invoice breakdowns" },
    ],
  },
  {
    title: "Support & compliance",
    description: "Internal support operations and audit readiness.",
    items: [
      { href: "/dashboard/support-overview", label: "Support overview", hint: "SLA & workload" },
      { href: "/dashboard/support", label: "Support desk", hint: "Case queue" },
      { href: "/dashboard/audit", label: "Audit & policy", hint: "System events & policy" },
    ],
  },
  {
    title: "Platform health",
    description: "Infrastructure readiness and platform service checks.",
    items: [{ href: "/dashboard/platform-health", label: "Platform health", hint: "Queues and infra checks" }],
  },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <aside className="space-y-6 rounded-3xl border border-amber-200/70 bg-white/80 p-5 text-sm text-slate-700 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Platform console</p>
        <p className="text-lg font-semibold text-slate-900">Control plane</p>
        <p className="text-xs text-slate-500">Separate lifecycle, billing, and support operations.</p>
      </div>

      {navSections.map((section) => (
        <div key={section.title} className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
            <p className="text-xs text-slate-500">{section.description}</p>
          </div>
          <div className="space-y-2">
            {section.items.map((item) => {
              const active =
                pathname === item.href || (pathname === "/dashboard" && item.href === "/dashboard/overview");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col rounded-2xl border px-3 py-2 text-xs transition ${
                    active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50"
                  }`}
                >
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-xs text-slate-500">{item.hint}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
