import type { BillingInvoice } from "../../shared/lib/types";
import { getApiErrorMessage } from "../../shared/lib/api";
import { summarizeInvoices } from "../domain/invoice";
import { fetchBillingInvoices, fetchBillingPortalUrl } from "../infrastructure/billingRepository";

export type BillingWorkspaceSnapshot = {
  portalUrl: string | null;
  invoicesSupported: boolean;
  invoices: BillingInvoice[];
};

export async function loadBillingWorkspaceSnapshot(): Promise<BillingWorkspaceSnapshot> {
  const [portalUrl, invoicesResult] = await Promise.all([
    fetchBillingPortalUrl().catch(() => null),
    fetchBillingInvoices(),
  ]);

  return {
    portalUrl,
    invoicesSupported: invoicesResult.supported,
    invoices: invoicesResult.invoices,
  };
}

export async function loadBillingInvoicesForDetails(): Promise<BillingInvoice[]> {
  const result = await fetchBillingInvoices();
  if (!result.supported) {
    return [];
  }
  return result.invoices;
}

export async function loadBillingInvoiceCatalog(): Promise<{ supported: boolean; invoices: BillingInvoice[] }> {
  return fetchBillingInvoices();
}

export function toBillingErrorMessage(error: unknown, fallback: string): string {
  return getApiErrorMessage(error, fallback);
}

export { summarizeInvoices };
