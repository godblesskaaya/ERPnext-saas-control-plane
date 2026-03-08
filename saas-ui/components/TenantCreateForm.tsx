"use client";

import { useEffect, useMemo, useState } from "react";

import { api, getApiErrorMessage } from "../lib/api";
import type { TenantCreatePayload, TenantCreateResponse } from "../lib/types";
import { BUSINESS_APP_OPTIONS, PlanSelector } from "./PlanSelector";

type Props = {
  onCreated: (result: TenantCreateResponse) => void | Promise<void>;
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

export function TenantCreateForm({ onCreated }: Props) {
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
    <form id="create-tenant" onSubmit={submit} className="space-y-5 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Launch a workspace your team can use today</h2>
        <p className="text-sm text-slate-300">
          Reserve tenant identity, choose operating level, and continue to payment when needed.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm text-slate-300" htmlFor="subdomain-input">
            Subdomain
          </label>
          <input
            id="subdomain-input"
            className="w-full rounded-md border border-slate-600 bg-slate-950 p-2.5 text-slate-100"
            placeholder="mlimani"
            value={subdomain}
            onChange={(e) => setSubdomain(normalizeSubdomain(e.target.value))}
            required
          />
          <p className="text-xs text-slate-400">Tenant URL preview: {domainPreview}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-slate-300" htmlFor="company-input">
            Company name
          </label>
          <input
            id="company-input"
            className="w-full rounded-md border border-slate-600 bg-slate-950 p-2.5 text-slate-100"
            placeholder="Mlimani Traders Ltd"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
          <p className="text-xs text-slate-400">Shown in tenant records, billing, and internal ops reporting.</p>
        </div>
      </div>

      <PlanSelector value={plan} onChange={setPlan} chosenApp={chosenApp} onChosenAppChange={setChosenApp} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
          <p className="font-medium text-slate-100">Request preview</p>
          <p className="mt-1">Plan: {plan}</p>
          {plan.toLowerCase() === "business" ? (
            <p>
              Chosen app: <span className="text-emerald-200">{selectedBusinessApp?.label ?? chosenApp}</span>
            </p>
          ) : (
            <p>Chosen app: auto-managed by selected plan</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
          <p className="font-medium text-slate-100">What happens next</p>
          <ul className="mt-1 space-y-1 leading-relaxed">
            <li>• Payment step appears only when required by your backend flow.</li>
            <li>• Provisioning status updates live after request submission.</li>
            <li>• Designed for teams coordinating from laptop + phone across Tanzania.</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy}
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Submitting workspace..." : "Create workspace"}
        </button>
        <span className="text-xs text-slate-400">Duplicate-submit protection is active.</span>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {created ? (
        <div className="space-y-2 rounded border border-emerald-700 bg-emerald-950/30 p-3 text-sm">
          <p className="font-semibold text-emerald-200">Workspace request accepted</p>
          <p>
            <span className="text-slate-300">Domain:</span> {created.tenant.domain}
          </p>
          <p>
            <span className="text-slate-300">Status:</span> {created.tenant.status}
          </p>
          {plan.toLowerCase() === "business" ? (
            <p className="text-xs text-emerald-100">Business focus: {selectedBusinessApp?.label ?? chosenApp}</p>
          ) : null}
          {created.checkout_url ? (
            <a
              className="inline-flex rounded bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-600"
              href={created.checkout_url}
              target="_blank"
              rel="noreferrer"
            >
              Continue to payment
            </a>
          ) : (
            <p className="text-emerald-200">Checkout link not returned. Contact support if payment is expected.</p>
          )}
        </div>
      ) : null}
    </form>
  );
}
