"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Tenant } from "../../lib/types";

export default function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    api.listAllTenants().then(setTenants).catch(() => setTenants([]));
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin Tenants</h1>
      <ul className="space-y-2">
        {tenants.map((tenant) => (
          <li key={tenant.id} className="rounded border border-slate-700 p-3">
            {tenant.company_name} — {tenant.status} — {tenant.domain}
          </li>
        ))}
      </ul>
    </section>
  );
}
