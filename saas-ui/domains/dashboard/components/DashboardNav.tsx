"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard/overview", label: "Overview" },
  { href: "/dashboard/onboarding", label: "Onboarding & payments" },
  { href: "/dashboard/incidents", label: "Failed / incidents" },
  { href: "/dashboard/active", label: "Active tenants" },
  { href: "/dashboard/activity", label: "Jobs & activity" },
  { href: "/dashboard/support", label: "Support queue" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 rounded-3xl border border-amber-200/70 bg-white/80 p-3 text-sm text-slate-700">
      {navItems.map((item) => {
        const active = pathname === item.href || (pathname === "/dashboard" && item.href === "/dashboard/overview");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              active ? "bg-[#0d6a6a] text-white" : "bg-white text-slate-700 hover:bg-amber-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
