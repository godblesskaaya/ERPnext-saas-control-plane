import type { TenantStatus } from "../../lib/types";
import { cn } from "../../lib/cn";

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (["active"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["provisioning", "upgrading", "restoring"].includes(normalized)) return "border-amber-200 bg-amber-50 text-amber-800";
  if (["suspended", "suspended_admin", "suspended_billing", "pending_deletion", "deleting"].includes(normalized))
    return "border-red-200 bg-red-50 text-red-800";
  if (["failed", "deleted"].includes(normalized)) return "border-rose-300 bg-rose-100 text-rose-900";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function StatusBadge({ status, className }: { status: TenantStatus | string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", statusClass(status), className)}>
      {String(status).replaceAll("_", " ")}
    </span>
  );
}

