import type { MetricsSummary, Tenant } from "../../shared/lib/types";

const SUSPENDED_STATUSES = new Set(["suspended", "suspended_admin", "suspended_billing"]);
const PROVISIONING_STATUSES = new Set([
  "pending",
  "pending_payment",
  "provisioning",
  "upgrading",
  "restoring",
  "pending_deletion",
]);

export type AdminTenantCounts = {
  suspendedCount: number;
  provisioningCount: number;
  failedCount: number;
  activeCount: number;
};

export function deriveAdminTenantCounts(tenants: Tenant[]): AdminTenantCounts {
  let suspendedCount = 0;
  let provisioningCount = 0;
  let failedCount = 0;
  let activeCount = 0;

  for (const tenant of tenants) {
    const status = tenant.status.toLowerCase();
    if (status === "active") activeCount += 1;
    if (status === "failed") failedCount += 1;
    if (SUSPENDED_STATUSES.has(status)) suspendedCount += 1;
    if (PROVISIONING_STATUSES.has(status)) provisioningCount += 1;
  }

  return { suspendedCount, provisioningCount, failedCount, activeCount };
}

export type AdminMetricAlert = {
  type: "warning";
  title: string;
  body: string;
};

export function deriveAdminMetricAlertKey(metrics: MetricsSummary): string {
  return `${metrics.failed_tenants}-${metrics.dead_letter_count}-${metrics.provisioning_tenants}`;
}

export function deriveAdminMetricAlerts(metrics: MetricsSummary): AdminMetricAlert[] {
  const alerts: AdminMetricAlert[] = [];
  if (metrics.failed_tenants > 0) {
    alerts.push({
      type: "warning",
      title: "Provisioning failures detected",
      body: `${metrics.failed_tenants} tenant(s) are in failed state.`,
    });
  }
  if (metrics.dead_letter_count > 0) {
    alerts.push({
      type: "warning",
      title: "Dead-letter queue backlog",
      body: `${metrics.dead_letter_count} job(s) waiting for requeue.`,
    });
  }
  return alerts;
}

export function buildTenantActionPhrase(subdomain: string): string {
  return subdomain.toUpperCase();
}
