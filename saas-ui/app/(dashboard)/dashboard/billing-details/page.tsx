"use client";

import { useEffect, useMemo, useState } from "react";

import { loadBillingInvoiceCatalog, summarizeInvoices } from "../../../../domains/billing/application/billingUseCases";
import { paymentChannelFromInvoice, providerFromInvoice } from "../../../../domains/billing/domain/invoice";
import { getApiErrorMessage } from "../../../../domains/shared/lib/api";
import type { BillingInvoice } from "../../../../domains/shared/lib/types";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} EAT`;
}

function formatAmount(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return "—";
  const value = amount / 100;
  const label = currency ? currency.toUpperCase() : "TZS";
  return `${label} ${value.toLocaleString()}`;
}

function statusTone(status?: string | null): string {
  const normalized = status?.toLowerCase() ?? "";
  if (["paid", "succeeded"].includes(normalized)) return "bg-emerald-100 text-emerald-800";
  if (["open", "draft", "processing"].includes(normalized)) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

export default function BillingDetailsPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [channelFilter, setChannelFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadBillingInvoiceCatalog();
      if (!result.supported) {
        setInvoices([]);
        setError("Billing invoices are not enabled on this backend.");
        return;
      }
      setInvoices(result.invoices);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load billing invoices."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => summarizeInvoices(invoices), [invoices]);
  const { overdueCount, paidCount, channelCounts, collectionCounts, providerCounts } = summary;

  const filteredInvoices = useMemo(() => {
    if (channelFilter === "all") return invoices;
    return invoices.filter((invoice) => paymentChannelFromInvoice(invoice) === channelFilter);
  }, [channelFilter, invoices]);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Billing details</p>
          <h1 className="text-3xl font-semibold text-slate-900">Invoices and payment channels</h1>
          <p className="text-sm text-slate-600">
            Track invoice status, retries, and payment channels (mobile money, card, or bank transfer).
          </p>
        </div>
        <button
          className="rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-amber-300 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh data"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Invoices tracked</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{invoices.length}</p>
          <p className="mt-1 text-xs text-slate-500">Most recent billing records</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Paid</p>
          <p className="mt-1 text-2xl font-semibold">{paidCount}</p>
          <p className="mt-1 text-xs opacity-80">Cleared invoices</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-xs uppercase tracking-wide opacity-80">Overdue / open</p>
          <p className="mt-1 text-2xl font-semibold">{overdueCount}</p>
          <p className="mt-1 text-xs opacity-80">Needs follow-up</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Payment channels</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Channel split (from invoice data)</p>
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            {Object.keys(channelCounts).length ? (
              Object.entries(channelCounts).map(([channel, count]) => (
                <div key={channel} className="flex items-center justify-between">
                  <span>{channel}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))
            ) : (
              <p>Channel data not available yet.</p>
            )}
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {Object.keys(collectionCounts).length ? (
              Object.entries(collectionCounts).map(([method, count]) => (
                <div key={method} className="flex items-center justify-between">
                  <span>Collection: {method.replace("_", " ")}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))
            ) : null}
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {Object.keys(providerCounts).length ? (
              Object.entries(providerCounts).map(([provider, count]) => (
                <div key={provider} className="flex items-center justify-between">
                  <span>Provider: {provider}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))
            ) : null}
          </div>
        </article>
      </div>

      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Invoice ledger</p>
            <p className="text-xs text-slate-500">Most recent invoices and their payment status.</p>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {["all", "Card", "Mobile money", "Bank transfer", "Invoice", "Unknown"].map((channel) => (
            <button
              key={channel}
              className={`rounded-full border px-3 py-1 ${
                channelFilter === channel
                  ? "border-[#0d6a6a] bg-[#0d6a6a] text-white"
                  : "border-amber-200 bg-white text-slate-600 hover:border-amber-300"
              }`}
              onClick={() => setChannelFilter(channel)}
            >
              {channel}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3 text-sm text-slate-700">
          {filteredInvoices.length ? (
            filteredInvoices.map((invoice) => (
              <div key={invoice.id} className="rounded-2xl border border-amber-200/70 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{formatDate(invoice.created_at)}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">Invoice {invoice.id}</p>
                    <p className="mt-1 text-xs text-slate-600">Billing status tracking</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(invoice.status)}`}>
                    {invoice.status ?? "unknown"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span>Amount due: {formatAmount(invoice.amount_due, invoice.currency)}</span>
                  <span>Amount paid: {formatAmount(invoice.amount_paid, invoice.currency)}</span>
                  <span>Channel: {paymentChannelFromInvoice(invoice)}</span>
                  {invoice.payment_method_types?.length ? (
                    <span>Methods: {invoice.payment_method_types.join(", ")}</span>
                  ) : null}
                  {providerFromInvoice(invoice) ? <span>Provider: {providerFromInvoice(invoice)}</span> : null}
                  {invoice.hosted_invoice_url ? (
                    <a
                      href={invoice.hosted_invoice_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300"
                    >
                      View invoice
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-amber-200/70 bg-white p-4 text-sm text-slate-600">
              No invoices match this channel yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
