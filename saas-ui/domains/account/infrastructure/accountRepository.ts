import { api } from "../../shared/lib/api";
import type { BillingInvoice, UserProfile } from "../../shared/lib/types";
import {
  fromApiPreferences,
  toApiPreferences,
  type NotificationPreferences,
} from "../domain/settingsPreferences";

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

export async function fetchNotificationPreferences(): Promise<{
  supported: boolean;
  preferences: NotificationPreferences;
}> {
  const result = await api.getCurrentUserNotificationPreferences();
  if (!result.supported) {
    return { supported: false, preferences: fromApiPreferences(null) };
  }
  return { supported: true, preferences: fromApiPreferences(result.data) };
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences
): Promise<{ supported: boolean; preferences: NotificationPreferences }> {
  const result = await api.updateCurrentUserNotificationPreferences(toApiPreferences(preferences));
  if (!result.supported) {
    return { supported: false, preferences };
  }
  return { supported: true, preferences: fromApiPreferences(result.data) };
}
