"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { PlanSelector } from "./PlanSelector";

type Props = {
  onCreated: () => void;
};

export function TenantCreateForm({ onCreated }: Props) {
  const [subdomain, setSubdomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createTenant({
        subdomain,
        company_name: companyName,
        plan,
      });
      setSubdomain("");
      setCompanyName("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded border border-slate-700 p-4">
      <h2 className="text-lg font-semibold">Create ERP Instance</h2>
      <input
        className="w-full rounded border border-slate-600 bg-slate-900 p-2"
        placeholder="subdomain"
        value={subdomain}
        onChange={(e) => setSubdomain(e.target.value)}
        required
      />
      <input
        className="w-full rounded border border-slate-600 bg-slate-900 p-2"
        placeholder="company name"
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        required
      />
      <PlanSelector value={plan} onChange={setPlan} />
      <button
        disabled={busy}
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-60"
      >
        {busy ? "Creating..." : "Create ERP"}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </form>
  );
}
