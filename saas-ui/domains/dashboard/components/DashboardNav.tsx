"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNavSections as navSections } from "../domain/navigation";

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
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
