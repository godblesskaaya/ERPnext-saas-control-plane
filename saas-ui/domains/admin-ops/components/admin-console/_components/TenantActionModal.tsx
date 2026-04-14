"use client";

import type { TenantAdminAction } from "./adminConsoleTypes";

type TenantActionModalProps = {
  tenantAction: TenantAdminAction | null;
  tenantActionInput: string;
  onTenantActionInputChange: (value: string) => void;
  tenantActionReason: string;
  onTenantActionReasonChange: (value: string) => void;
  busyTenantId: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TenantActionModal({
  tenantAction,
  tenantActionInput,
  onTenantActionInputChange,
  tenantActionReason,
  onTenantActionReasonChange,
  busyTenantId,
  onCancel,
  onConfirm,
}: TenantActionModalProps) {
  if (!tenantAction) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-white">{tenantAction.type === "suspend" ? "Suspend tenant" : "Unsuspend tenant"}</h3>
        <p className="mt-2 text-sm text-slate-300">
          To confirm, type <span className="font-mono text-sky-200">{tenantAction.phrase}</span>.
        </p>
        <p className="mt-1 text-xs text-slate-400">{tenantAction.tenant.company_name}</p>

        <input
          className="mt-4 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={tenantActionInput}
          onChange={(event) => onTenantActionInputChange(event.target.value)}
          placeholder={tenantAction.phrase}
        />
        <textarea
          className="mt-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          rows={2}
          value={tenantActionReason}
          onChange={(event) => onTenantActionReasonChange(event.target.value)}
          placeholder="Optional: document the reason for this action"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60"
            disabled={busyTenantId === tenantAction.tenant.id || tenantActionInput !== tenantAction.phrase}
            onClick={onConfirm}
          >
            {busyTenantId === tenantAction.tenant.id
              ? tenantAction.type === "suspend"
                ? "Suspending..."
                : "Reactivating..."
              : tenantAction.type === "suspend"
              ? "Confirm suspend"
              : "Confirm unsuspend"}
          </button>
        </div>
      </div>
    </div>
  );
}

