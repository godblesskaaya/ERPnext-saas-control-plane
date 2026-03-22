"use client";

import { useEffect, useMemo, useState } from "react";

import { api, getApiErrorMessage } from "../../../../domains/shared/lib/api";
import type { BillingInvoice, UserProfile } from "../../../../domains/shared/lib/types";

function formatMoney(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return "—";
  const code = (currency || "usd").toUpperCase();
  const value = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function DashboardAccountPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoicesSupported, setInvoicesSupported] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await api.getCurrentUser();
        if (!active) return;
        setProfile(next);
        setProfileError(null);
      } catch (err) {
        if (!active) return;
        setProfileError(getApiErrorMessage(err, "Failed to load profile"));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api.getBillingPortal();
        if (!active) return;
        if (!result.supported) {
          setPortalUrl(null);
          return;
        }
        setPortalUrl(result.data.url);
      } catch (err) {
        if (!active) return;
        setPortalError(getApiErrorMessage(err, "Billing portal unavailable"));
      }
    })();

    void (async () => {
      try {
        const result = await api.listBillingInvoices();
        if (!active) return;
        if (!result.supported) {
          setInvoicesSupported(false);
          setInvoices([]);
          return;
        }
        setInvoicesSupported(true);
        setInvoices(result.data.invoices ?? []);
      } catch (err) {
        if (!active) return;
        setInvoiceError(getApiErrorMessage(err, "Failed to load invoices"));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const latestInvoice = useMemo(() => {
    if (!invoices.length) return null;
    return [...invoices].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
  }, [invoices]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Account workspace</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Account summary</h1>
        <p className="mt-1 text-sm text-slate-600">
          Identity, billing, and readiness details for your control-plane account.
        </p>
      </div>

      {profileError ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{profileError}</p> : null}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
          <p className="mt-1 font-semibold text-slate-900">{profile?.email ?? "—"}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Role</p>
          <p className="mt-1 font-semibold text-slate-900">{profile?.role ?? "—"}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Phone (SMS)</p>
          <p className="mt-1 font-semibold text-slate-900">{profile?.phone || "Not set"}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Email verification</p>
          <p className="mt-1 font-semibold text-slate-900">{profile?.email_verified ? "Verified" : "Pending"}</p>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-5">
          <p className="text-sm font-semibold text-slate-900">Billing workspace</p>
          <p className="mt-1 text-sm text-slate-600">
            Continue collections, invoice reviews, and payment follow-up from your billing workspace.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {portalUrl ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-[#0d6a6a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b5a5a]"
              >
                Open billing portal
              </a>
            ) : (
              <a
                href="/dashboard/billing"
                className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
              >
                Go to billing queue
              </a>
            )}
          </div>
          {portalError ? <p className="mt-2 text-xs text-red-700">{portalError}</p> : null}
        </div>

        <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-5">
          <p className="text-sm font-semibold text-slate-900">Latest invoice snapshot</p>
          {!invoicesSupported ? (
            <p className="mt-2 text-sm text-slate-600">Invoice endpoint is not available on this backend deployment.</p>
          ) : latestInvoice ? (
            <div className="mt-2 space-y-1 text-sm text-slate-700">
              <p>
                Amount due: <span className="font-semibold">{formatMoney(latestInvoice.amount_due, latestInvoice.currency)}</span>
              </p>
              <p>
                Status: <span className="font-semibold">{latestInvoice.status ?? "unknown"}</span>
              </p>
              <p>
                Created: <span className="font-semibold">{formatTimestamp(latestInvoice.created_at ?? null)}</span>
              </p>
              {latestInvoice.hosted_invoice_url ? (
                <a
                  href={latestInvoice.hosted_invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
                >
                  View invoice
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No invoice data available yet.</p>
          )}
          {invoiceError ? <p className="mt-2 text-xs text-red-700">{invoiceError}</p> : null}
        </div>
      </div>
    </section>
  );
}

