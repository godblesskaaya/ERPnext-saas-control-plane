import { getApiErrorMessage } from "../../shared/lib/api";
import type { BillingInvoice, UserProfile } from "../../shared/lib/types";
import type { NotificationPreferences } from "../domain/settingsPreferences";
import {
  fetchBillingInvoices,
  fetchBillingPortalUrl,
  fetchCurrentUserProfile,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  updateCurrentUserPhone,
} from "../infrastructure/accountRepository";

export type BillingPortalResult = {
  supported: boolean;
  url: string | null;
};

export type BillingInvoicesResult = {
  supported: boolean;
  invoices: BillingInvoice[];
};

export async function loadAccountProfile(): Promise<UserProfile> {
  return fetchCurrentUserProfile();
}

export async function loadAccountBillingPortal(): Promise<BillingPortalResult> {
  return fetchBillingPortalUrl();
}

export async function loadAccountBillingInvoices(): Promise<BillingInvoicesResult> {
  return fetchBillingInvoices();
}

export async function saveAccountPhone(phoneInput: string): Promise<UserProfile> {
  const phone = phoneInput.trim() || null;
  return updateCurrentUserPhone(phone);
}

export async function loadAccountNotificationPreferences(): Promise<{
  supported: boolean;
  preferences: NotificationPreferences;
}> {
  return fetchNotificationPreferences();
}

export async function saveAccountNotificationPreferences(
  preferences: NotificationPreferences
): Promise<{ supported: boolean; preferences: NotificationPreferences }> {
  return updateNotificationPreferences(preferences);
}

export function pickLatestInvoice(invoices: BillingInvoice[]): BillingInvoice | null {
  if (!invoices.length) return null;
  return [...invoices].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
}

export function toAccountErrorMessage(err: unknown, fallback: string): string {
  return getApiErrorMessage(err, fallback);
}
