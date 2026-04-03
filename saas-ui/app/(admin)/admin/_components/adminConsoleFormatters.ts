export function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-500/20 text-emerald-300";
  if (
    ["provisioning", "pending", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized)
  ) {
    return "bg-sky-500/20 text-sky-200";
  }
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  if (normalized === "deleted") return "bg-slate-500/20 text-slate-300";
  if (["suspended", "suspended_admin", "suspended_billing"].includes(normalized)) return "bg-rose-500/20 text-rose-200";
  return "bg-sky-500/20 text-sky-300";
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

