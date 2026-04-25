import type { ChipProps, SxProps, Theme } from "@mui/material";

import type { Job } from "./types";

export { formatAmount, formatDate, formatMoney, formatTimestamp } from "./formatters";

export const TERMINAL_JOB_STATUSES = new Set([
  "succeeded",
  "failed",
  "deleted",
  "canceled",
  "cancelled",
]);

export function isTerminalJobStatus(status?: string | null): boolean {
  return TERMINAL_JOB_STATUSES.has((status || "").toLowerCase());
}

export function hasActiveJob(jobs?: Job[] | null): boolean {
  return Boolean(jobs?.some((job) => !isTerminalJobStatus(job.status)));
}

export type TenantRowTone = "default" | "warn" | "error";

export function getTenantStatusChip(status: string): { color: ChipProps["color"]; sx?: SxProps<Theme> } {
  const normalized = status.toLowerCase();
  if (normalized === "active") return { color: "success" };
  if (["failed", "deleted"].includes(normalized)) return { color: "error" };
  if (["pending", "pending_payment", "provisioning", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized)) {
    return { color: "warning" };
  }
  if (["suspended", "suspended_admin", "suspended_billing"].includes(normalized)) {
    return { color: "warning", sx: { bgcolor: "#ffedd5", color: "#9a3412" } };
  }
  return { color: "info", sx: { bgcolor: "#e0f2fe", color: "#0369a1" } };
}

export function getTenantStatusHint(status: string, isAdmin = false): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return isAdmin ? "Serving daily operations" : "Serving daily workspace activity";
  if (normalized === "pending_payment") return "Waiting for checkout confirmation";
  if (normalized === "pending" || normalized === "provisioning") return "Setup in progress";
  if (normalized === "upgrading") return "Upgrade running";
  if (normalized === "restoring") return "Restore in progress";
  if (normalized === "pending_deletion") return "Deletion scheduled";
  if (normalized === "failed") return isAdmin ? "Needs operator follow-up" : "Needs support follow-up";
  if (normalized === "suspended_admin") return isAdmin ? "Paused by admin" : "Access paused";
  if (normalized === "suspended_billing") return "Paused for billing";
  if (normalized === "suspended") return "Access paused";
  if (normalized === "deleted") return "Archived";
  return "Status under review";
}

export function getTenantRowTone(status: string): TenantRowTone {
  const normalized = status.toLowerCase();
  if (normalized === "failed") return "error";
  if (["pending", "pending_payment", "provisioning", "upgrading", "restoring", "pending_deletion"].includes(normalized)) return "warn";
  return "default";
}

export function getTenantRowToneSx(status: string): string | undefined {
  const tone = getTenantRowTone(status);
  if (tone === "error") return "rgba(254, 242, 242, 1)";
  if (tone === "warn") return "rgba(255, 251, 235, 0.65)";
  return undefined;
}

export function getPlanChip(plan: string): { label: string; color: ChipProps["color"]; sx?: SxProps<Theme> } {
  const normalized = plan.toLowerCase();
  if (normalized === "enterprise") return { label: "Enterprise", color: "default", sx: { bgcolor: "#e2e8f0", color: "#334155" } };
  if (normalized === "business") return { label: "Business", color: "primary", sx: { bgcolor: "rgba(13,106,106,0.15)", color: "primary.main" } };
  if (normalized === "starter") return { label: "Starter", color: "warning", sx: { bgcolor: "#fef3c7", color: "#92400e" } };
  return { label: plan || "—", color: "default" };
}

