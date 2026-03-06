"use client";

import { useMemo, useState } from "react";

import { api, getApiErrorMessage } from "../lib/api";
import type { TenantCreateResponse } from "../lib/types";
import { PlanSelector } from "./PlanSelector";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<TenantCreateResponse | null>(null);

  const normalizedSubdomain = useMemo(() => normalizeSubdomain(subdomain), [subdomain]);
  const domainPreview = normalizedSubdomain
    ? `${normalizedSubdomain}.${DOMAIN_SUFFIX}`
    : `your-company.${DOMAIN_SUFFIX}`;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    if (normalizedSubdomain.length < 3) {
      setBusy(false);
      setError("Subdomain must be at least 3 characters.");
      return;
    }

    try {
      const result = await api.createTenant({
        subdomain: normalizedSubdomain,
        company_name: companyName.trim(),
        plan,
      });
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

  return (
    <form id="create-tenant" onSubmit={submit} className="space-y-4 rounded border border-slate-700 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Create ERP Instance</h2>
        <p className="text-sm text-slate-300">Choose a subdomain, pick a plan, then continue to secure checkout.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-slate-300" htmlFor="subdomain-input">
          Subdomain
        </label>
        <input
          id="subdomain-input"
          className="w-full rounded border border-slate-600 bg-slate-900 p-2"
          placeholder="acme"
          value={subdomain}
          onChange={(e) => setSubdomain(normalizeSubdomain(e.target.value))}
          required
        />
        <p className="text-xs text-slate-400">Your ERP URL will be: {domainPreview}</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-slate-300" htmlFor="company-input">
          Company name
        </label>
        <input
          id="company-input"
          className="w-full rounded border border-slate-600 bg-slate-900 p-2"
          placeholder="Acme Inc"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
        />
      </div>

      <PlanSelector value={plan} onChange={setPlan} />

      <button
        disabled={busy}
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Creating..." : "Create ERP"}
      </button>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {created ? (
        <div className="space-y-2 rounded border border-emerald-700 bg-emerald-950/30 p-3 text-sm">
          <p className="font-semibold text-emerald-200">Tenant request accepted</p>
          <p>
            <span className="text-slate-300">Domain:</span> {created.tenant.domain}
          </p>
          {created.checkout_url ? (
            <a
              className="inline-flex rounded bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-600"
              href={created.checkout_url}
              target="_blank"
              rel="noreferrer"
            >
              Continue to checkout
            </a>
          ) : (
            <p className="text-emerald-200">Checkout URL unavailable. Please contact support.</p>
          )}
        </div>
      ) : null}
    </form>
  );
}
