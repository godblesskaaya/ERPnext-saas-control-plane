"use client";

import { useEffect, useState } from "react";
import { TenantCreateForm } from "../../components/TenantCreateForm";
import { TenantTable } from "../../components/TenantTable";
import { api } from "../../lib/api";
import type { ResetAdminPasswordResult, Tenant } from "../../lib/types";

export default function DashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetAdminPasswordResult | null>(null);

  const load = async () => {
    try {
      const data = await api.listTenants();
      setTenants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <TenantCreateForm onCreated={load} />
      {error ? <p className="text-red-400">{error}</p> : null}
      {resetResult ? (
        <div className="rounded border border-emerald-700 bg-emerald-950/40 p-3 text-sm">
          <p className="font-semibold">Administrator password reset successful.</p>
          <p>Tenant: {resetResult.domain}</p>
          <p>User: {resetResult.administrator_user}</p>
          <p>Password: {resetResult.admin_password}</p>
          <p className="mt-1 text-emerald-300">Copy this now — it is shown once.</p>
        </div>
      ) : null}
      <TenantTable
        tenants={tenants}
        onBackup={async (id) => {
          await api.backupTenant(id);
          await load();
        }}
        onResetAdminPassword={async (id, newPassword) => {
          try {
            const result = await api.resetAdminPassword(id, newPassword);
            setResetResult(result);
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reset admin password");
            throw err;
          }
        }}
        onDelete={async (id) => {
          await api.deleteTenant(id);
          await load();
        }}
      />
    </section>
  );
}
