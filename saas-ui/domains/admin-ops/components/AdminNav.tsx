"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { adminNavSections } from "../domain/adminNavigation";

type SearchParamsReader = Pick<URLSearchParams, "get">;

function isNavItemActive(href: string, pathname: string, searchParams: SearchParamsReader): boolean {
  const [targetPath, targetQuery = ""] = href.split("?");

  if (!targetQuery) {
    return pathname === targetPath || pathname.startsWith(targetPath + "/");
  }

  if (pathname !== targetPath) {
    return false;
  }

  const targetParams = new URLSearchParams(targetQuery);
  for (const [key, value] of targetParams.entries()) {
    const currentValue = searchParams.get(key);
    if (currentValue === value) {
      continue;
    }

    const isAdminOverviewFallback =
      targetPath === "/admin" && key === "view" && value === "overview" && (currentValue === null || currentValue === "");

    if (!isAdminOverviewFallback) {
      return false;
    }
  }

  return true;
}

export function AdminNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="space-y-6 rounded-3xl border border-slate-800 bg-slate-950/90 p-5 text-sm text-slate-200 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Admin shell</p>
        <p className="text-lg font-semibold text-white">Platform command center</p>
        <p className="text-xs text-slate-400">Privileged navigation for control-plane operators.</p>
      </div>

      {adminNavSections.map((section) => (
        <div key={section.title} className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{section.title}</p>
            <p className="text-xs text-slate-500">{section.description}</p>
          </div>
          <div className="space-y-2">
            {section.items.map((item) => {
              const active = isNavItemActive(item.href, pathname, searchParams);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col rounded-2xl border px-3 py-2 text-xs transition ${
                    active
                      ? "border-amber-300/50 bg-amber-500/10 text-amber-100"
                      : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-amber-400/40 hover:bg-slate-900"
                  }`}
                >
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-xs text-slate-400">{item.hint}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
