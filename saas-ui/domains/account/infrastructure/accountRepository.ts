import { api } from "../../shared/lib/api";
import type { BillingInvoice, UserProfile } from "../../shared/lib/types";

export async function fetchCurrentUserProfile(): Promise<UserProfile> {
  return api.getCurrentUser();
}

export async function updateCurrentUserPhone(phone: string | null): Promise<UserProfile> {
  return api.updateCurrentUser({ phone });
}

export async function fetchBillingPortalUrl(): Promise<{ supported: boolean; url: string | null }> {
  const result = await api.getBillingPortal();
  if (!result.supported) {
    return { supported: false, url: null };
  }
  return { supported: true, url: result.data.url };
}

export async function fetchBillingInvoices(): Promise<{ supported: boolean; invoices: BillingInvoice[] }> {
  const result = await api.listBillingInvoices();
  if (!result.supported) {
    return { supported: false, invoices: [] };
  }
  return { supported: true, invoices: result.data.invoices ?? [] };
}
