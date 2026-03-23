import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  loadBillingInvoiceCatalog,
  loadBillingInvoicesForDetails,
  loadBillingWorkspaceSnapshot,
  summarizeInvoices,
} from "./billingUseCases";
import { api } from "../../shared/lib/api";

const originalApi = {
  getBillingPortal: api.getBillingPortal,
  listBillingInvoices: api.listBillingInvoices,
};

afterEach(() => {
  api.getBillingPortal = originalApi.getBillingPortal;
  api.listBillingInvoices = originalApi.listBillingInvoices;
});

test("loadBillingWorkspaceSnapshot combines portal and invoices", async () => {
  api.getBillingPortal = async () => ({ supported: true, data: { url: "https://billing.example.com" } });
  api.listBillingInvoices = async () => ({
    supported: true,
    data: {
      invoices: [
        {
          id: "inv-1",
          status: "open",
          amount_due: 250000,
          amount_paid: 0,
          currency: "tzs",
        },
      ],
    },
  });

  const snapshot = await loadBillingWorkspaceSnapshot();
  assert.equal(snapshot.portalUrl, "https://billing.example.com");
  assert.equal(snapshot.invoicesSupported, true);
  assert.equal(snapshot.invoices.length, 1);
  assert.equal(snapshot.invoices[0]?.id, "inv-1");
});

test("billing use-cases gracefully handle unsupported invoice endpoints", async () => {
  api.getBillingPortal = async () => ({ supported: false, data: null });
  api.listBillingInvoices = async () => ({ supported: false, data: null });

  const snapshot = await loadBillingWorkspaceSnapshot();
  const details = await loadBillingInvoicesForDetails();
  const catalog = await loadBillingInvoiceCatalog();

  assert.equal(snapshot.portalUrl, null);
  assert.equal(snapshot.invoicesSupported, false);
  assert.deepEqual(snapshot.invoices, []);
  assert.deepEqual(details, []);
  assert.deepEqual(catalog, { supported: false, invoices: [] });
});

test("summarizeInvoices computes due/open/paid counters for dashboard cards", () => {
  const summary = summarizeInvoices([
    { id: "a", status: "paid", amount_due: 1000, amount_paid: 1000, currency: "tzs" },
    { id: "b", status: "open", amount_due: 2000, amount_paid: 0, currency: "tzs" },
    { id: "c", status: "uncollectible", amount_due: 4000, amount_paid: 0, currency: "tzs" },
  ]);

  assert.equal(summary.paidCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.channelCounts.Unknown, 3);
});
