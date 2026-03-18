import { api } from "../../shared/lib/api";
import type { BillingInvoice } from "../../shared/lib/types";

export type BillingInvoiceResult = {
  supported: boolean;
  invoices: BillingInvoice[];
};

export async function fetchBillingPortalUrl(): Promise<string | null> {
  const result = await api.getBillingPortal();
  if (!result.supported) {
    return null;
  }
  return result.data.url;
}

export async function fetchBillingInvoices(): Promise<BillingInvoiceResult> {
  const result = await api.listBillingInvoices();
  if (!result.supported) {
    return { supported: false, invoices: [] };
  }
  return { supported: true, invoices: result.data.invoices ?? [] };
}
