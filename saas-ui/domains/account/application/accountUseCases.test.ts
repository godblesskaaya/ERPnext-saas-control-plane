import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  loadAccountBillingInvoices,
  loadAccountBillingPortal,
  loadAccountProfile,
  pickLatestInvoice,
  saveAccountPhone,
} from "./accountUseCases";
import { api } from "../../shared/lib/api";

const originalApi = {
  getCurrentUser: api.getCurrentUser,
  updateCurrentUser: api.updateCurrentUser,
  getBillingPortal: api.getBillingPortal,
  listBillingInvoices: api.listBillingInvoices,
};

afterEach(() => {
  api.getCurrentUser = originalApi.getCurrentUser;
  api.updateCurrentUser = originalApi.updateCurrentUser;
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
