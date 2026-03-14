"use client";

import { useEffect, useState } from "react";

import { api, getApiErrorMessage } from "../../../domains/shared/lib/api";
import type { BillingInvoice } from "../../../domains/shared/lib/types";

function formatCurrency(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return "—";
  const normalized = currency ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: normalized }).format(amount / 100);
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const portal = await api.getBillingPortal();
        if (portal.supported) {
          setPortalUrl(portal.data.url);
        }
      } catch {
        // ignore portal errors
      }

      try {
        const result = await api.listBillingInvoices();
        if (!result.supported) {
          setSupported(false);
          setInvoices([]);
          return;
        }
        setSupported(true);
        setInvoices(result.data.invoices ?? []);
      } catch (err) {
        setError(getApiErrorMessage(err, "Failed to load invoices"));
      }
    };

    void load();
  }, []);

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Billing & invoices</h1>
            <p className="text-sm text-slate-600">Review payment history and manage your subscription.</p>
          </div>
          {portalUrl ? (
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#0d6a6a] px-4 py-2 text-xs font-semibold text-white"
            >
              Open billing portal
            </a>
          ) : null}
        </div>
      </div>

      {!supported ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Invoice history is not available for the active payment provider.
        </p>
      ) : error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : invoices.length ? (
        <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white/90">
          <table className="min-w-full text-sm">
            <thead className="bg-[#fff7ed] text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="p-2.5">Invoice</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Amount due</th>
                <th className="p-2.5">Amount paid</th>
                <th className="p-2.5">Created</th>
                <th className="p-2.5">Link</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-amber-200/60">
                  <td className="p-2.5 font-mono text-xs text-slate-700">{invoice.id}</td>
                  <td className="p-2.5 text-xs text-slate-700">{invoice.status ?? "—"}</td>
                  <td className="p-2.5 text-xs text-slate-700">
                    {formatCurrency(invoice.amount_due ?? undefined, invoice.currency)}
                  </td>
                  <td className="p-2.5 text-xs text-slate-700">
                    {formatCurrency(invoice.amount_paid ?? undefined, invoice.currency)}
                  </td>
                  <td className="p-2.5 text-xs text-slate-700">{formatTimestamp(invoice.created_at)}</td>
                  <td className="p-2.5 text-xs">
                    {invoice.hosted_invoice_url ? (
                      <a className="text-[#0d6a6a] hover:text-[#0b5a5a]" href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : invoice.invoice_pdf ? (
                      <a className="text-[#0d6a6a] hover:text-[#0b5a5a]" href={invoice.invoice_pdf} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No invoices found yet.
        </p>
      )}
    </section>
  );
}
