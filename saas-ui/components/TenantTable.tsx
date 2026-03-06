"use client";

import { useState } from "react";

import type { Tenant } from "../lib/types";

type Props = {
  tenants: Tenant[];
  onBackup: (id: string) => void;
  onDelete: (id: string) => void;
  onResetAdminPassword: (id: string, newPassword?: string) => Promise<void>;
};

export function TenantTable({ tenants, onBackup, onDelete, onResetAdminPassword }: Props) {
  const [resetTenantId, setResetTenantId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/50 text-left">
            <tr>
              <th className="p-2">Tenant</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Status</th>
              <th className="p-2">ERP URL</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-slate-700">
                <td className="p-2">{tenant.company_name}</td>
                <td className="p-2">{tenant.plan}</td>
                <td className="p-2">{tenant.status}</td>
                <td className="p-2">
                  <a href={`https://${tenant.domain}`} target="_blank" rel="noreferrer">
                    Open ERP
                  </a>
                </td>
                <td className="p-2 space-x-2">
                  <button className="rounded bg-slate-700 px-2 py-1" onClick={() => onBackup(tenant.id)}>
                    Backup
                  </button>
                  <button
                    className="rounded bg-amber-700 px-2 py-1"
                    onClick={() => {
                      setResetTenantId(tenant.id);
                      setNewPassword("");
                    }}
                  >
                    Reset Admin Password
                  </button>
                  <button className="rounded bg-red-700 px-2 py-1" onClick={() => onDelete(tenant.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!tenants.length && (
              <tr>
                <td className="p-2" colSpan={5}>
                  No tenants yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resetTenantId ? (
        <div className="rounded border border-amber-700 bg-amber-950/30 p-4 text-sm">
          <p className="mb-2 font-semibold">Reset Administrator Password</p>
          <p className="mb-3 text-amber-100/90">
            Enter a new password, or leave blank to auto-generate one securely.
          </p>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mb-3 w-full rounded border border-slate-600 bg-slate-900 p-2"
            placeholder="New password (optional)"
          />
          <div className="space-x-2">
            <button
              disabled={isSubmitting}
              className="rounded bg-amber-700 px-3 py-1.5 disabled:opacity-60"
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  await onResetAdminPassword(resetTenantId, newPassword || undefined);
                  setResetTenantId(null);
                  setNewPassword("");
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? "Resetting..." : "Confirm Reset"}
            </button>
            <button
              disabled={isSubmitting}
              className="rounded border border-slate-600 px-3 py-1.5 disabled:opacity-60"
              onClick={() => {
                setResetTenantId(null);
                setNewPassword("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
