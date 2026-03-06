"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { JobLogPanel } from "../../../components/JobLogPanel";
import { api } from "../../../lib/api";

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    api.getTenant(id).then(setTenant).catch(() => setTenant(null));
  }, [id]);

  if (!tenant) {
    return <p>Loading tenant...</p>;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{tenant.company_name}</h1>
      <p>Status: {tenant.status}</p>
      <p>
        ERP URL:{" "}
        <a href={`https://${tenant.domain}`} target="_blank" rel="noreferrer">
          {tenant.domain}
        </a>
      </p>
      <JobLogPanel logs={"Use /jobs/{id} polling in dashboard for detailed logs."} />
    </section>
  );
}
