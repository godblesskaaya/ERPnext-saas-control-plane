import { fallbackPlanCatalog, normalizePlanCatalog, type PlanCatalogItem } from "../domain/planCatalog";
import { listPublicPlans } from "../infrastructure/subscriptionRepository";

export async function loadPublicPlanCatalog(): Promise<PlanCatalogItem[]> {
  try {
    const plans = await listPublicPlans();
    if (!plans.length) return fallbackPlanCatalog;
    return plans.map(normalizePlanCatalog);
  } catch {
    // AGENT-NOTE: The requested ARC SaaS repository is backend-only (no frontend implementation),
    // so we mirror ARC frontend principles (layered domain/application/infrastructure) while
    // preserving resilient UX via fallback catalog data when plans endpoint is unavailable.
    return fallbackPlanCatalog;
  }
}

