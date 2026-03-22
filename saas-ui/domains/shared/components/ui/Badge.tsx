import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

type Tone = "default" | "success" | "warning" | "error" | "info";

const toneClass: Record<Tone, string> = {
  default: "border-slate-200 bg-slate-100 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function Badge({ children, tone = "default", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", toneClass[tone], className)}>
      {children}
    </span>
  );
}

