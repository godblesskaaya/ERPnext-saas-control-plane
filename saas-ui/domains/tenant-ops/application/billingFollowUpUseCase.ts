import { summarizeBillingFollowUps } from "../domain/followups";
import { fetchTenants } from "../infrastructure/tenantRepository";

export async function loadBillingFollowUpSummary() {
  const tenants = await fetchTenants();
  return summarizeBillingFollowUps(tenants);
}
