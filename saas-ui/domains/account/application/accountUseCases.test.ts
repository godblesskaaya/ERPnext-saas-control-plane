import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  loadAccountNotificationPreferences,
  loadAccountBillingInvoices,
  loadAccountBillingPortal,
  loadAccountProfile,
  pickLatestInvoice,
  saveAccountNotificationPreferences,
  saveAccountPhone,
} from "./accountUseCases";
import { api } from "../../shared/lib/api";
import { DEFAULT_PREFERENCES } from "../domain/settingsPreferences";

const originalApi = {
  getCurrentUser: api.getCurrentUser,
  updateCurrentUser: api.updateCurrentUser,
  getCurrentUserNotificationPreferences: api.getCurrentUserNotificationPreferences,
  updateCurrentUserNotificationPreferences: api.updateCurrentUserNotificationPreferences,
  getBillingPortal: api.getBillingPortal,
  listBillingInvoices: api.listBillingInvoices,
};

afterEach(() => {
  api.getCurrentUser = originalApi.getCurrentUser;
  api.updateCurrentUser = originalApi.updateCurrentUser;
  api.getCurrentUserNotificationPreferences = originalApi.getCurrentUserNotificationPreferences;
  api.updateCurrentUserNotificationPreferences = originalApi.updateCurrentUserNotificationPreferences;
  api.getBillingPortal = originalApi.getBillingPortal;
  api.listBillingInvoices = originalApi.listBillingInvoices;
});

test("loadAccountProfile and saveAccountPhone use account repository contracts", async () => {
  api.getCurrentUser = async () => ({
    id: "u-1",
    email: "owner@example.com",
    role: "owner",
    email_verified: true,
    phone: "+255700000000",
    created_at: "2026-03-23T00:00:00Z",
  });

  let capturedPhone: string | null = "unset";
  api.updateCurrentUser = async ({ phone }) => {
    capturedPhone = phone ?? null;
    return {
      id: "u-1",
      email: "owner@example.com",
      role: "owner",
      email_verified: true,
      phone: capturedPhone,
      created_at: "2026-03-23T00:00:00Z",
    };
  };

  const profile = await loadAccountProfile();
  const updated = await saveAccountPhone("  +255712345678 ");

  assert.equal(profile.email, "owner@example.com");
  assert.equal(capturedPhone, "+255712345678");
  assert.equal(updated.phone, "+255712345678");
});

test("loadAccountBillingPortal and invoices map supported/unsupported responses", async () => {
  api.getBillingPortal = async () => ({ supported: true, data: { url: "https://billing.example.com" } });
  api.listBillingInvoices = async () => ({
    supported: true,
    data: {
      invoices: [{ id: "inv-2", created_at: "2026-03-22T10:00:00Z" }],
    },
  });

  const portal = await loadAccountBillingPortal();
  const invoices = await loadAccountBillingInvoices();
  assert.deepEqual(portal, { supported: true, url: "https://billing.example.com" });
  assert.equal(invoices.supported, true);
  assert.equal(invoices.invoices.length, 1);

  api.getBillingPortal = async () => ({ supported: false, data: null });
  api.listBillingInvoices = async () => ({ supported: false, data: null });
  const unsupportedPortal = await loadAccountBillingPortal();
  const unsupportedInvoices = await loadAccountBillingInvoices();
  assert.deepEqual(unsupportedPortal, { supported: false, url: null });
  assert.deepEqual(unsupportedInvoices, { supported: false, invoices: [] });
});

test("pickLatestInvoice returns most recent invoice by created timestamp", () => {
  const latest = pickLatestInvoice([
    { id: "inv-a", created_at: "2026-03-20T00:00:00Z" },
    { id: "inv-b", created_at: "2026-03-23T00:00:00Z" },
  ]);

  assert.equal(latest?.id, "inv-b");
  assert.equal(pickLatestInvoice([]), null);
});

test("notification preference use cases map API payloads and fallback behavior", async () => {
  api.getCurrentUserNotificationPreferences = async () => ({
    supported: true,
    data: {
      email_alerts: true,
      sms_alerts: false,
      billing_alerts: true,
      provisioning_alerts: true,
      support_alerts: false,
    },
  });

  let capturedPayloadJson = "";
  api.updateCurrentUserNotificationPreferences = async (payload) => {
    capturedPayloadJson = JSON.stringify(payload);
    return { supported: true, data: payload };
  };

  const loaded = await loadAccountNotificationPreferences();
  const saved = await saveAccountNotificationPreferences({
    ...loaded.preferences,
    billingAlerts: false,
  });

  assert.equal(loaded.supported, true);
  assert.equal(loaded.preferences.smsAlerts, false);
  assert.equal(saved.supported, true);
  assert.match(capturedPayloadJson, /"billing_alerts":false/);
  assert.equal(saved.preferences.billingAlerts, false);

  api.getCurrentUserNotificationPreferences = async () => ({ supported: false, data: null });
  api.updateCurrentUserNotificationPreferences = async () => ({ supported: false, data: null });
  const unsupportedLoaded = await loadAccountNotificationPreferences();
  const unsupportedSaved = await saveAccountNotificationPreferences(DEFAULT_PREFERENCES);
  assert.equal(unsupportedLoaded.supported, false);
  assert.deepEqual(unsupportedLoaded.preferences, DEFAULT_PREFERENCES);
  assert.equal(unsupportedSaved.supported, false);
  assert.deepEqual(unsupportedSaved.preferences, DEFAULT_PREFERENCES);
});
