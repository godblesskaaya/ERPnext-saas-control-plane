"use client";

import { useEffect, useMemo, useState } from "react";

import { api, getApiErrorMessage } from "../lib/api";
import type { TenantCreatePayload, TenantCreateResponse } from "../lib/types";
import { BUSINESS_APP_OPTIONS, PlanSelector } from "./PlanSelector";

type Props = {
  onCreated: (result: TenantCreateResponse) => void | Promise<void>;
  canCreate?: boolean;
  verificationNotice?: string | null;
  onResendVerification?: () => Promise<void>;
};

const DOMAIN_SUFFIX = (process.env.NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX ?? "erp.blenkotechnologies.co.tz").trim();

function normalizeSubdomain(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function TenantCreateForm({ onCreated, canCreate = true, verificationNotice, onResendVerification }: Props) {
  const [subdomain, setSubdomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [chosenApp, setChosenApp] = useState("erpnext");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<TenantCreateResponse | null>(null);

  const normalizedSubdomain = useMemo(() => normalizeSubdomain(subdomain), [subdomain]);
  const domainPreview = normalizedSubdomain ? `${normalizedSubdomain}.${DOMAIN_SUFFIX}` : `your-company.${DOMAIN_SUFFIX}`;

  useEffect(() => {
    if (plan.toLowerCase() !== "business") {
      setChosenApp("erpnext");
    }
  }, [plan]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      setError("Verify your email before creating a workspace.");
      return;
    }
    setBusy(true);
    setError(null);

    if (normalizedSubdomain.length < 3) {
      setBusy(false);
      setError("Subdomain must be at least 3 characters.");
      return;
    }

    if (!companyName.trim()) {
      setBusy(false);
      setError("Company name is required.");
      return;
    }

    const payload: TenantCreatePayload = {
      subdomain: normalizedSubdomain,
      company_name: companyName.trim(),
      plan,
    };

    if (plan.toLowerCase() === "business") {
      payload.chosen_app = chosenApp;
    }

    try {
      const result = await api.createTenant(payload);
      setCreated(result);
      setSubdomain("");
      setCompanyName("");
      await onCreated(result);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to create tenant"));
    } finally {
      setBusy(false);
    }
  };

  const selectedBusinessApp = BUSINESS_APP_OPTIONS.find((option) => option.id === chosenApp);

  return (
    <form
      id="create-tenant"
      onSubmit={submit}
      className="space-y-5 rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">Launch a workspace your team can use today</h2>
        <p className="text-sm text-slate-600">
          Reserve tenant identity, choose operating level, and continue to payment when needed.
        </p>
      </div>

      {!canCreate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold">Email verification required</p>
          <p className="mt-1">Please verify your email before creating a workspace.</p>
          {verificationNotice ? <p className="mt-2 text-amber-900">{verificationNotice}</p> : null}
          {onResendVerification ? (
            <button
              type="button"
              className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:border-amber-400"
              onClick={() => void onResendVerification()}
            >
              Resend verification email
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm text-slate-600" htmlFor="subdomain-input">
            Subdomain
          </label>
          <input
            id="subdomain-input"
            className="w-full rounded-xl border border-amber-200 bg-white p-2.5 text-slate-900 shadow-sm focus:border-amber-300 focus:outline-none"
            placeholder="mlimani"
            value={subdomain}
            onChange={(e) => setSubdomain(normalizeSubdomain(e.target.value))}
            required
          />
          <p className="text-xs text-slate-500">Tenant URL preview: {domainPreview}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-slate-600" htmlFor="company-input">
            Company name
          </label>
          <input
            id="company-input"
            className="w-full rounded-xl border border-amber-200 bg-white p-2.5 text-slate-900 shadow-sm focus:border-amber-300 focus:outline-none"
            placeholder="Mlimani Traders Ltd"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
          <p className="text-xs text-slate-500">Shown in tenant records, billing, and internal ops reporting.</p>
        </div>
      </div>

      <PlanSelector value={plan} onChange={setPlan} chosenApp={chosenApp} onChosenAppChange={setChosenApp} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-amber-200/70 bg-[#fdf7ee] p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-900">Request preview</p>
          <p className="mt-1">Plan: {plan}</p>
          {plan.toLowerCase() === "business" ? (
            <p>
              Chosen app: <span className="text-[#0d6a6a]">{selectedBusinessApp?.label ?? chosenApp}</span>
            </p>
          ) : (
            <p>Chosen app: auto-managed by selected plan</p>
          )}
        </div>

        <div className="rounded-2xl border border-amber-200/70 bg-white p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-900">What happens next</p>
          <ul className="mt-1 space-y-1 leading-relaxed">
            <li>• Payment step appears only when required by your backend flow.</li>
            <li>• Provisioning status updates live after request submission.</li>
            <li>• Designed for teams coordinating from laptop + phone across Tanzania.</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy || !canCreate}
          type="submit"
          className="rounded-full bg-[#0d6a6a] px-5 py-2 font-semibold text-white hover:bg-[#0b5a5a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Submitting workspace..." : "Create workspace"}
        </button>
        <span className="text-xs text-slate-500">Duplicate-submit protection is active.</span>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {created ? (
        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-semibold text-emerald-900">Workspace request accepted</p>
          <p>
            <span className="text-slate-600">Domain:</span> {created.tenant.domain}
          </p>
          <p>
            <span className="text-slate-600">Status:</span> {created.tenant.status}
          </p>
          {plan.toLowerCase() === "business" ? (
            <p className="text-xs text-emerald-700">Business focus: {selectedBusinessApp?.label ?? chosenApp}</p>
          ) : null}
          {created.checkout_url ? (
            <a
              className="inline-flex rounded-full bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-600"
              href={created.checkout_url}
              target="_blank"
              rel="noreferrer"
            >
              Continue to payment
            </a>
          ) : (
            <p className="text-emerald-700">Checkout link not returned. Contact support if payment is expected.</p>
          )}
        </div>
      ) : null}
    </form>
  );
}
