"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import type { Job, ResetAdminPasswordResult, Tenant } from "../lib/types";
import { JobLogPanel } from "./JobLogPanel";
import { getPlanMeta } from "./PlanSelector";

type Props = {
  tenants: Tenant[];
  jobsByTenant: Record<string, Job | undefined>;
  onBackup: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResetAdminPassword: (id: string, newPassword?: string) => Promise<ResetAdminPasswordResult>;
  onJobUpdate?: (job: Job) => void;
};

type ConfirmAction = {
  type: "delete" | "reset";
  tenant: Tenant;
  phrase: string;
};

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-500/20 text-emerald-300";
  if (normalized === "provisioning" || normalized === "pending" || normalized === "deleting") {
    return "bg-amber-500/20 text-amber-300";
  }
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  if (normalized === "deleted") return "bg-slate-500/20 text-slate-300";
  if (normalized === "suspended") return "bg-orange-500/20 text-orange-300";
  return "bg-sky-500/20 text-sky-300";
}

function planBadgeClass(plan: string): string {
  const normalized = plan.toLowerCase();
  if (normalized === "enterprise") return "bg-violet-500/20 text-violet-200";
  if (normalized === "business") return "bg-blue-500/20 text-blue-200";
  return "bg-slate-600/30 text-slate-200";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getBillingLabel(tenant: Tenant): string {
  if (tenant.billing_status?.trim()) return tenant.billing_status;
  if (tenant.stripe_subscription_id) return "subscribed";
  if (tenant.stripe_checkout_session_id) return "checkout_created";
  return "n/a";
}

export function TenantTable({ tenants, jobsByTenant, onBackup, onDelete, onResetAdminPassword, onJobUpdate }: Props) {
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);
  const [passwordResult, setPasswordResult] = useState<ResetAdminPasswordResult | null>(null);
  const [passwordExpiry, setPasswordExpiry] = useState<number | null>(null);
  const [passwordNow, setPasswordNow] = useState<number>(Date.now());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const remainingSeconds = useMemo(() => {
    if (!passwordExpiry) return 0;
    return Math.max(0, Math.ceil((passwordExpiry - passwordNow) / 1000));
  }, [passwordExpiry, passwordNow]);

  useEffect(() => {
    if (!passwordResult) {
      setPasswordExpiry(null);
      return;
    }

    const expiresAt = Date.now() + 30_000;
    setPasswordExpiry(expiresAt);
    setPasswordNow(Date.now());

    const timeout = window.setTimeout(() => {
      setPasswordResult(null);
      setCopyState("idle");
      setPasswordExpiry(null);
    }, 30_000);

    const interval = window.setInterval(() => {
      setPasswordNow(Date.now());
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [passwordResult]);

  const closeConfirm = () => {
    setConfirmAction(null);
    setConfirmInput("");
    setNewPassword("");
    setConfirmError(null);
    setIsSubmitting(false);
  };

  const handleConfirm = async () => {
    if (!confirmAction || confirmInput !== confirmAction.phrase) {
      return;
    }

    setIsSubmitting(true);
    setConfirmError(null);

    try {
      if (confirmAction.type === "delete") {
        await onDelete(confirmAction.tenant.id);
      } else {
        const result = await onResetAdminPassword(confirmAction.tenant.id, newPassword || undefined);
        setPasswordResult(result);
      }
      closeConfirm();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Action failed");
      setIsSubmitting(false);
    }
  };

  if (!tenants.length) {
    return (
      <div className="rounded border border-dashed border-slate-600 bg-slate-900/40 p-8 text-center">
        <p className="text-3xl">📦</p>
        <p className="mt-2 text-lg font-semibold">No ERP instances yet</p>
        <p className="mt-1 text-sm text-slate-300">Create your first ERP instance to start provisioning.</p>
        <a href="#create-tenant" className="mt-4 inline-flex rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500">
          Create your first ERP instance
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {passwordResult ? (
        <div className="rounded border border-emerald-700 bg-emerald-950/40 p-3 text-sm">
          <p className="font-semibold">Administrator password reset successful</p>
          <p>Tenant: {passwordResult.domain}</p>
          <p>User: {passwordResult.administrator_user}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded bg-black/30 px-2 py-1 text-emerald-200">{passwordResult.admin_password}</code>
            <button
              type="button"
              className="rounded border border-emerald-500 px-2 py-1 text-xs hover:bg-emerald-900/60"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(passwordResult.admin_password);
                  setCopyState("copied");
                } catch {
                  setCopyState("error");
                }
              }}
            >
              Copy
            </button>
            {copyState === "copied" ? <span className="text-xs text-emerald-200">Copied</span> : null}
            {copyState === "error" ? <span className="text-xs text-red-300">Copy failed</span> : null}
          </div>
          <p className="mt-1 text-xs text-emerald-300">Auto-dismisses in {remainingSeconds}s.</p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-300">
            <tr>
              <th className="p-2.5">Tenant</th>
              <th className="p-2.5">Plan / App</th>
              <th className="p-2.5">Status</th>
              <th className="p-2.5">Billing</th>
              <th className="p-2.5">Created</th>
              <th className="p-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const job = jobsByTenant[tenant.id];
              const plan = getPlanMeta(tenant.plan);
              const confirmationPhrase = tenant.subdomain.toUpperCase();

              return (
                <Fragment key={tenant.id}>
                  <tr className="border-t border-slate-700/80 align-top">
                    <td className="space-y-1 p-2.5">
                      <p className="font-medium text-white">{tenant.company_name}</p>
                      <p className="text-xs text-slate-300">{tenant.subdomain}</p>
                      <a
                        href={`https://${tenant.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-300 hover:text-blue-200"
                      >
                        {tenant.domain}
                      </a>
                    </td>
                    <td className="p-2.5">
                      <div className="space-y-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${planBadgeClass(tenant.plan)}`}>
                          {plan?.label ?? tenant.plan}
                        </span>
                        <p className="text-xs text-slate-300">
                          App: <span className="text-slate-100">{tenant.chosen_app || "auto"}</span>
                        </p>
                        {tenant.payment_provider ? (
                          <p className="text-xs text-slate-400">Provider: {tenant.payment_provider}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(tenant.status)}`}>
                        {tenant.status}
                      </span>
                      {job ? <p className="mt-1 text-xs text-slate-400">Job: {job.status}</p> : null}
                    </td>
                    <td className="p-2.5 text-xs text-slate-300">{getBillingLabel(tenant)}</td>
                    <td className="p-2.5 text-xs text-slate-300">{formatDate(tenant.created_at)}</td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <a
                          href={`/tenants/${tenant.id}`}
                          className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
                        >
                          Details
                        </a>
                        <button
                          className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={busyTenantId === tenant.id}
                          onClick={async () => {
                            setBusyTenantId(tenant.id);
                            try {
                              await onBackup(tenant.id);
                            } finally {
                              setBusyTenantId(null);
                            }
                          }}
                        >
                          Backup
                        </button>
                        <button
                          className="rounded bg-amber-700 px-2 py-1 text-xs hover:bg-amber-600"
                          onClick={() => {
                            setConfirmAction({ type: "reset", tenant, phrase: confirmationPhrase });
                            setConfirmInput("");
                            setNewPassword("");
                            setConfirmError(null);
                          }}
                        >
                          Reset admin
                        </button>
                        <button
                          className="rounded bg-red-700 px-2 py-1 text-xs hover:bg-red-600"
                          onClick={() => {
                            setConfirmAction({ type: "delete", tenant, phrase: confirmationPhrase });
                            setConfirmInput("");
                            setConfirmError(null);
                          }}
                        >
                          Delete
                        </button>
                        {job ? (
                          <button
                            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
                            onClick={() => setExpandedTenantId((current) => (current === tenant.id ? null : tenant.id))}
                          >
                            {expandedTenantId === tenant.id ? "Hide logs" : "Show logs"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>

                  {job && expandedTenantId === tenant.id ? (
                    <tr className="border-t border-slate-700/80 bg-slate-900/30">
                      <td className="p-3" colSpan={6}>
                        <JobLogPanel
                          jobId={job.id}
                          logs={job.logs}
                          status={job.status}
                          onJobUpdate={(nextJob) => {
                            onJobUpdate?.(nextJob);
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md space-y-3 rounded border border-slate-700 bg-slate-900 p-4 text-sm">
            <h3 className="text-base font-semibold">
              {confirmAction.type === "delete" ? "Confirm tenant deletion" : "Confirm admin password reset"}
            </h3>
            <p className="text-slate-300">
              Tenant: <strong>{confirmAction.tenant.company_name}</strong>
            </p>
            <p className="text-slate-300">
              Type <code className="rounded bg-black/40 px-1">{confirmAction.phrase}</code> to continue.
            </p>
            <input
              className="w-full rounded border border-slate-600 bg-slate-950 p-2"
              value={confirmInput}
              onChange={(event) => setConfirmInput(event.target.value.toUpperCase())}
              placeholder="Type confirmation text"
            />
            {confirmAction.type === "reset" ? (
              <input
                type="password"
                className="w-full rounded border border-slate-600 bg-slate-950 p-2"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Optional: set a specific new password"
              />
            ) : null}
            {confirmError ? <p className="text-red-400">{confirmError}</p> : null}
            <div className="flex justify-end gap-2">
              <button className="rounded border border-slate-600 px-3 py-1.5" disabled={isSubmitting} onClick={closeConfirm}>
                Cancel
              </button>
              <button
                className="rounded bg-red-700 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting || confirmInput !== confirmAction.phrase}
                onClick={() => {
                  void handleConfirm();
                }}
              >
                {isSubmitting ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
