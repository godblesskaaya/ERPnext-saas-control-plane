"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getDashboardNavSectionsByMode,
  resolveDashboardNavMode,
  type DashboardNavItem,
  type DashboardNavMode,
} from "../domain/navigation";

const modeConfig: Record<
  DashboardNavMode,
  { label: string; title: string; description: string; switchHint: string }
> = {
  operations: {
    label: "Operations",
    title: "Operations workspace",
    description: "Navigate lifecycle, billing, support, and platform workflows.",
    switchHint: "Queue-driven routing across onboarding, incidents, billing, and support.",
  },
  workspace: {
    label: "Workspace",
    title: "Workspace context",
    description: "Navigate tenant records, active workspaces, and your account settings.",
    switchHint: "Open tenant-level and account-level views for focused workspace actions.",
  },
};

function isActiveRoute(pathname: string, item: DashboardNavItem): boolean {
  const matchers = [item.href, ...(item.match ?? [])];
  return matchers.some((matcher) => pathname === matcher || pathname.startsWith(matcher + "/"));
}

export function DashboardNav() {
  const pathname = usePathname();
  const sectionsByMode = useMemo(
    () => ({
      operations: getDashboardNavSectionsByMode("operations"),
      workspace: getDashboardNavSectionsByMode("workspace"),
    }),
    [],
  );
  const inferredMode = useMemo(() => resolveDashboardNavMode(pathname), [pathname]);

  const [mode, setMode] = useState<DashboardNavMode>(inferredMode);

  useEffect(() => {
    setMode(inferredMode);
  }, [inferredMode]);

  const visibleSections = sectionsByMode[mode];
  const activeModeConfig = modeConfig[mode];

  return (
    <aside className="sticky top-24 space-y-6 self-start rounded-3xl border border-amber-200/70 bg-white/80 p-5 text-sm text-slate-700 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">User shell</p>
        <p className="text-lg font-semibold text-slate-900">{activeModeConfig.title}</p>
        <p className="text-xs text-slate-500">{activeModeConfig.description}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Navigation mode</p>
        <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-slate-100/70 p-1">
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

      {visibleSections.map((section) => (
        <div key={section.title} className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
            <p className="text-xs text-slate-500">{section.description}</p>
          </div>
          <div className="space-y-2">
            {section.items.map((item) => {
              const active = isActiveRoute(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "flex flex-col rounded-2xl border px-3 py-2 text-xs transition " +
                    (active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50")
                  }
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
