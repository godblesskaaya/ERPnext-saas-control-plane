"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import type { Job, ResetAdminPasswordResult, Tenant } from "../../shared/lib/types";
import { JobLogPanel } from "../../shared/components/JobLogPanel";
import { BUSINESS_APP_OPTIONS, getPlanMeta } from "../../onboarding/components/PlanSelector";

type Props = {
  tenants: Tenant[];
  jobsByTenant: Record<string, Job | undefined>;
  onBackup: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResetAdminPassword: (id: string, newPassword?: string) => Promise<ResetAdminPasswordResult>;
  onJobUpdate?: (job: Job) => void;
  onRetryProvisioning?: (id: string) => Promise<void>;
  retryingTenantId?: string | null;
  onUpdatePlan?: (id: string, payload: { plan: string; chosen_app?: string }) => Promise<void>;
  updatingTenantId?: string | null;
  emptyStateTitle?: string;
  emptyStateBody?: string;
  emptyStateActionLabel?: string;
  emptyStateActionHref?: string;
  filterLabel?: string;
  showPaymentChannel?: boolean;
};

type ConfirmAction = {
  type: "delete" | "reset";
  tenant: Tenant;
  phrase: string;
};

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-100 text-emerald-800";
  if (
    ["provisioning", "pending", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized)
  ) {
    return "bg-amber-100 text-amber-800";
  }
  if (normalized === "failed") return "bg-red-100 text-red-700";
  if (normalized === "deleted") return "bg-slate-100 text-slate-500";
  if (["suspended", "suspended_admin", "suspended_billing"].includes(normalized)) return "bg-orange-100 text-orange-800";
  return "bg-sky-100 text-sky-800";
}

function statusHint(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "Serving daily operations";
  if (normalized === "pending_payment") return "Waiting for checkout confirmation";
  if (normalized === "pending" || normalized === "provisioning") return "Setup in progress";
  if (normalized === "upgrading") return "Upgrade running";
  if (normalized === "restoring") return "Restore in progress";
  if (normalized === "pending_deletion") return "Deletion scheduled";
  if (normalized === "failed") return "Needs operator follow-up";
  if (normalized === "suspended_admin") return "Paused by admin";
  if (normalized === "suspended_billing") return "Paused for billing";
  if (normalized === "suspended") return "Access paused";
  if (normalized === "deleted") return "Archived";
  return "Status under review";
}

function rowTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "failed") return "bg-red-50";
  if (
    ["pending", "pending_payment", "provisioning", "upgrading", "restoring", "pending_deletion"].includes(normalized)
  ) {
    return "bg-amber-50/60";
  }
  return "";
}

function planBadgeClass(plan: string): string {
  const normalized = plan.toLowerCase();
  if (normalized === "enterprise") return "bg-slate-200 text-slate-700";
  if (normalized === "business") return "bg-[#0d6a6a]/15 text-[#0d6a6a]";
  return "bg-amber-100 text-amber-800";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getBillingLabel(tenant: Tenant): string {
  if (tenant.billing_status?.trim()) return tenant.billing_status;
  if (tenant.platform_customer_id) return "platform_customer_linked";
  if (tenant.payment_provider && tenant.payment_provider !== "stripe") return tenant.payment_provider;
  if (tenant.stripe_subscription_id) return "subscribed";
  if (tenant.stripe_checkout_session_id) return "checkout_created";
  return "n/a";
}

export function TenantTable({
  tenants,
  jobsByTenant,
  onBackup,
  onDelete,
  onResetAdminPassword,
  onJobUpdate,
  onRetryProvisioning,
  retryingTenantId,
  onUpdatePlan,
  updatingTenantId,
  emptyStateTitle,
  emptyStateBody,
  emptyStateActionLabel,
  emptyStateActionHref,
  filterLabel,
  showPaymentChannel = false,
}: Props) {
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
  const [planActionTenant, setPlanActionTenant] = useState<Tenant | null>(null);
  const [planChoice, setPlanChoice] = useState("starter");
  const [planAppChoice, setPlanAppChoice] = useState(BUSINESS_APP_OPTIONS[0]?.id ?? "crm");
  const [planError, setPlanError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const failedCount = useMemo(() => tenants.filter((tenant) => tenant.status.toLowerCase() === "failed").length, [tenants]);
  const setupCount = useMemo(
    () =>
      tenants.filter((tenant) =>
        ["pending", "pending_payment", "provisioning", "upgrading", "restoring", "pending_deletion"].includes(
          tenant.status.toLowerCase()
        )
      ).length,
    [tenants]
  );
  const liveCount = useMemo(() => tenants.filter((tenant) => tenant.status.toLowerCase() === "active").length, [tenants]);
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tenants.forEach((tenant) => {
      const channel = tenant.payment_channel ?? "unknown";
      counts[channel] = (counts[channel] ?? 0) + 1;
    });
    return counts;
  }, [tenants]);

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

  const closePlanModal = () => {
    setPlanActionTenant(null);
    setPlanError(null);
    setPlanBusy(false);
  };

  const submitPlanUpdate = async () => {
    if (!planActionTenant || !onUpdatePlan) return;
    setPlanBusy(true);
    setPlanError(null);
    try {
      const payload = planChoice === "business" ? { plan: planChoice, chosen_app: planAppChoice } : { plan: planChoice };
      await onUpdatePlan(planActionTenant.id, payload);
      closePlanModal();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Plan update failed");
      setPlanBusy(false);
    }
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
    const title = emptyStateTitle ?? "No workspaces yet";
    const body = emptyStateBody ?? "Create your first workspace to start onboarding and daily operations.";
    const actionLabel = emptyStateActionLabel ?? "Create first workspace";
    const actionHref = emptyStateActionHref ?? "#create-tenant";

    return (
      <div className="rounded-3xl border border-dashed border-amber-200 bg-white/80 p-8 text-center">
        <p className="text-3xl">📦</p>
        <p className="mt-2 text-lg font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{body}</p>
        {actionHref ? (
          <a
            href={actionHref}
            className="mt-4 inline-flex rounded-full bg-[#0d6a6a] px-4 py-2 font-medium text-white hover:bg-[#0b5a5a]"
          >
            {actionLabel}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filterLabel ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {filterLabel}
        </div>
      ) : null}
      {showPaymentChannel ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <div className="flex flex-wrap gap-2">
            {Object.entries(channelCounts).map(([channel, count]) => (
              <span key={channel} className="rounded-full border border-slate-200 px-2 py-1 text-xs">
                {channel.replace(/_/g, " ")}: <span className="font-semibold">{count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {passwordResult ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-semibold text-emerald-900">Administrator password reset complete</p>
          <p>Tenant: {passwordResult.domain}</p>
          <p>User: {passwordResult.administrator_user}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded bg-black/10 px-2 py-1 text-emerald-900">{passwordResult.admin_password}</code>
            <button
              type="button"
              className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100"
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
            {copyState === "copied" ? <span className="text-xs text-emerald-700">Copied</span> : null}
            {copyState === "error" ? <span className="text-xs text-red-600">Copy failed</span> : null}
          </div>
          <p className="mt-1 text-xs text-emerald-700">Auto-dismisses in {remainingSeconds}s.</p>
        </div>
      ) : null}

      <div className="grid gap-2 text-xs md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
          Live environments: <span className="font-semibold">{liveCount}</span>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          In setup flow: <span className="font-semibold">{setupCount}</span>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">
          Need intervention: <span className="font-semibold">{failedCount}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-amber-200/70 bg-white/90">
        <table className="min-w-full text-sm">
          <thead className="bg-[#fff7ed] text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="p-2.5">Workspace</th>
              <th className="p-2.5">Package / focus</th>
              <th className="p-2.5">Health</th>
              <th className="p-2.5">Billing</th>
              {showPaymentChannel ? <th className="p-2.5">Channel</th> : null}
              <th className="p-2.5">Created</th>
              <th className="p-2.5">Quick actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const job = jobsByTenant[tenant.id];
              const plan = getPlanMeta(tenant.plan);
              const confirmationPhrase = tenant.subdomain.toUpperCase();

              return (
                <Fragment key={tenant.id}>
                  <tr className={`border-t border-amber-200/60 align-top ${rowTone(tenant.status)}`}>
                    <td className="space-y-1 p-2.5">
                      <p className="font-medium text-slate-900">{tenant.company_name}</p>
                      <p className="text-xs text-slate-500">{tenant.subdomain}</p>
                      <a
                        href={`https://${tenant.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#0d6a6a] hover:text-[#0b5a5a]"
                      >
                        {tenant.domain}
                      </a>
                    </td>
                    <td className="p-2.5">
                      <div className="space-y-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${planBadgeClass(tenant.plan)}`}>
                          {plan?.label ?? tenant.plan}
                        </span>
                        <p className="text-xs text-slate-500">
                          Focus: <span className="text-slate-900">{tenant.chosen_app || "auto"}</span>
                        </p>
                        {tenant.payment_provider ? (
                          <p className="text-xs text-slate-500">Provider: {tenant.payment_provider}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(tenant.status)}`}>
                        {tenant.status}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">{statusHint(tenant.status)}</p>
                      {job ? <p className="mt-1 text-xs text-slate-500">Job: {job.status}</p> : null}
                    </td>
                    <td className="p-2.5 text-xs text-slate-600">{getBillingLabel(tenant)}</td>
                    {showPaymentChannel ? (
                      <td className="p-2.5 text-xs text-slate-600">
                        {tenant.payment_channel ? tenant.payment_channel.replace(/_/g, " ") : "—"}
                      </td>
                    ) : null}
                    <td className="p-2.5 text-xs text-slate-600">{formatDate(tenant.created_at)}</td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <a
                          href={`/tenants/${tenant.id}`}
                          className="rounded-full border border-amber-200 px-2 py-1 text-xs text-slate-700 hover:border-amber-300"
                        >
                          Details
                        </a>
                        <button
                          className="rounded-full bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
                          Backup now
                        </button>
                        <button
                          className="rounded-full bg-amber-500 px-2 py-1 text-xs text-white hover:bg-amber-400"
                          onClick={() => {
                            setConfirmAction({ type: "reset", tenant, phrase: confirmationPhrase });
                            setConfirmInput("");
                            setNewPassword("");
                            setConfirmError(null);
                          }}
                        >
                          Reset admin login
                        </button>
                        {onUpdatePlan ? (
                          <button
                            className="rounded-full border border-amber-200 px-2 py-1 text-xs text-slate-700 hover:border-amber-300"
                            onClick={() => {
                              setPlanActionTenant(tenant);
                              setPlanChoice(tenant.plan);
                              setPlanAppChoice(tenant.chosen_app || BUSINESS_APP_OPTIONS[0]?.id || "crm");
                            }}
                          >
                            Change plan
                          </button>
                        ) : null}
                        <button
                          className="rounded-full bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
                          onClick={() => {
                            setConfirmAction({ type: "delete", tenant, phrase: confirmationPhrase });
                            setConfirmInput("");
                            setConfirmError(null);
                          }}
                        >
                          Delete workspace
                        </button>
                        {tenant.status.toLowerCase() === "failed" && onRetryProvisioning ? (
                          <button
                            className="rounded-full border border-amber-200 px-2 py-1 text-xs text-slate-700 hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={retryingTenantId === tenant.id}
                            onClick={() => {
                              void onRetryProvisioning(tenant.id);
                            }}
                          >
                            {retryingTenantId === tenant.id ? "Retrying..." : "Retry provisioning"}
                          </button>
                        ) : null}
                        {job ? (
                          <button
                            className="rounded-full border border-amber-200 px-2 py-1 text-xs text-slate-700 hover:border-amber-300"
                            onClick={() => setExpandedTenantId((current) => (current === tenant.id ? null : tenant.id))}
                          >
                            {expandedTenantId === tenant.id ? "Hide logs" : "Show logs"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>

                  {job && expandedTenantId === tenant.id ? (
                    <tr className="border-t border-amber-200/60 bg-[#fffaf4]">
                      <td className="p-3" colSpan={6}>
                        <JobLogPanel
                          jobId={job.id}
                          logs={job.logs}
                          status={job.status}
                          onJobUpdate={(nextJob: Job) => {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-amber-200 bg-white p-4 text-sm">
            <h3 className="text-base font-semibold text-slate-900">
              {confirmAction.type === "delete" ? "Confirm workspace deletion" : "Confirm admin password reset"}
            </h3>
            <p className="text-slate-600">
              Tenant: <strong>{confirmAction.tenant.company_name}</strong>
            </p>
            <p className="text-slate-600">
              Type <code className="rounded bg-black/10 px-1">{confirmAction.phrase}</code> to continue.
            </p>
            <input
              className="w-full rounded-xl border border-amber-200 bg-white p-2"
              value={confirmInput}
              onChange={(event) => setConfirmInput(event.target.value.toUpperCase())}
              placeholder="Type confirmation text"
            />
            {confirmAction.type === "reset" ? (
              <input
                type="password"
                className="w-full rounded-xl border border-amber-200 bg-white p-2"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Optional: set a specific new password"
              />
            ) : null}
            {confirmError ? <p className="text-red-600">{confirmError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                className="rounded-full border border-amber-200 px-3 py-1.5 text-slate-700"
                disabled={isSubmitting}
                onClick={closeConfirm}
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-red-600 px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
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

      {planActionTenant ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-amber-200 bg-white p-4 text-sm">
            <h3 className="text-base font-semibold text-slate-900">Change plan</h3>
            <p className="text-slate-600">
              Tenant: <strong>{planActionTenant.company_name}</strong>
            </p>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Plan</label>
              <select
                className="w-full rounded-xl border border-amber-200 bg-white p-2 text-sm"
                value={planChoice}
                onChange={(event) => setPlanChoice(event.target.value)}
              >
                <option value="starter">Starter</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            {planChoice === "business" ? (
              <div>
                <label className="mb-1 block text-xs text-slate-500">Business focus</label>
                <select
                  className="w-full rounded-xl border border-amber-200 bg-white p-2 text-sm"
                  value={planAppChoice}
                  onChange={(event) => setPlanAppChoice(event.target.value)}
                >
                  {BUSINESS_APP_OPTIONS.map((option: { id: string; label: string }) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {planError ? <p className="text-red-600">{planError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                className="rounded-full border border-amber-200 px-3 py-1.5 text-slate-700"
                onClick={closePlanModal}
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-[#0d6a6a] px-3 py-1.5 text-white disabled:opacity-60"
                disabled={planBusy || updatingTenantId === planActionTenant.id}
                onClick={() => void submitPlanUpdate()}
              >
                {planBusy || updatingTenantId === planActionTenant.id ? "Updating..." : "Confirm change"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
