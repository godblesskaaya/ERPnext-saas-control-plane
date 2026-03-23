import type { MetricsSummary } from "../../shared/lib/types";
import {
  fetchAuthHealth,
  fetchBillingHealth,
  fetchDashboardMetrics,
} from "../infrastructure/dashboardRepository";

export type DashboardEndpointState = "ok" | "unsupported" | "unavailable";

export type DashboardEndpointHealth = {
  state: DashboardEndpointState;
  message: string;
};

export type DashboardServiceHealthSnapshot = {
  auth: DashboardEndpointHealth;
  billing: DashboardEndpointHealth;
};

type DashboardDeps = {
  fetchMetrics: typeof fetchDashboardMetrics;
  fetchAuth: typeof fetchAuthHealth;
  fetchBilling: typeof fetchBillingHealth;
};

const defaultDeps: DashboardDeps = {
  fetchMetrics: fetchDashboardMetrics,
  fetchAuth: fetchAuthHealth,
  fetchBilling: fetchBillingHealth,
};

function unsupportedHealth(): DashboardEndpointHealth {
  return {
    state: "unsupported",
    message: "unsupported",
  };
}

function unavailableHealth(): DashboardEndpointHealth {
  return {
    state: "unavailable",
    message: "unavailable",
  };
}

export async function loadDashboardMetricsSnapshot(
  deps: DashboardDeps = defaultDeps
): Promise<MetricsSummary | null> {
  try {
    const result = await deps.fetchMetrics();
    if (!result.supported) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

export async function loadDashboardServiceHealthSnapshot(
  deps: DashboardDeps = defaultDeps
): Promise<DashboardServiceHealthSnapshot> {
  const authPromise = deps
    .fetchAuth()
    .then((result) => {
      if (!result.supported) {
        return unsupportedHealth();
      }
      return {
        state: "ok" as const,
        message: result.data.message ?? "ok",
      };
    })
    .catch(() => unavailableHealth());

  const billingPromise = deps
    .fetchBilling()
    .then((result) => {
      if (!result.supported) {
        return unsupportedHealth();
      }
      return {
        state: "ok" as const,
        message: result.data.message ?? "ok",
      };
    })
    .catch(() => unavailableHealth());

  const [auth, billing] = await Promise.all([authPromise, billingPromise]);
  return { auth, billing };
}
