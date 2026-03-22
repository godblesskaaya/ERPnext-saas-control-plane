"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { JobLogPanel } from "../../../../domains/shared/components/JobLogPanel";
import { api, getApiErrorMessage, isSessionExpiredError } from "../../../../domains/shared/lib/api";
import type {
  AuditLogEntry,
  BackupManifestEntry,
  DomainMapping,
  Job,
  SupportNote,
  Tenant,
  TenantMember,
  TenantSubscription,
  TenantSummary,
  UserProfile,
} from "../../../../domains/shared/lib/types";

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-100 text-emerald-800";
  if (["provisioning", "pending", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized)) {
    return "bg-amber-100 text-amber-800";
  }
  if (normalized === "failed") return "bg-red-100 text-red-700";
  if (normalized === "deleted") return "bg-slate-200 text-slate-600";
  if (["suspended", "suspended_admin", "suspended_billing"].includes(normalized)) return "bg-orange-100 text-orange-800";
  return "bg-sky-100 text-sky-800";
}

function domainStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "verified") return "bg-emerald-100 text-emerald-800";
  if (normalized === "pending") return "bg-amber-100 text-amber-800";
  if (normalized === "failed") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatCurrencyAmount(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return "—";
  const code = (currency || "usd").toUpperCase();
  const normalized = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(normalized);
  } catch {
    return `${normalized.toFixed(2)} ${code}`;
  }
}

function resolveBackupDownload(entry: BackupManifestEntry): string | null {
  const direct = entry.download_url;
  if (typeof direct === "string" && direct.trim()) return direct;
  const path = entry.file_path;
  if (typeof path === "string" && path.trim()) return path;
  return null;
}

function nextActionByStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "Workspace is live. Confirm users can log in and run first transactions.";
  if (normalized === "pending_payment") return "Complete payment to continue automatic provisioning.";
  if (normalized === "pending" || normalized === "provisioning") return "Provisioning is running. Keep this page open for status updates.";
  if (normalized === "upgrading") return "Upgrade in progress. Avoid configuration changes until it completes.";
  if (normalized === "restoring") return "Restore running. Monitor job logs for completion.";
  if (normalized === "pending_deletion") return "Deletion queued. Coordinate with support if this was unintentional.";
  if (normalized === "failed") return "Provisioning failed. Review related job logs and retry from dashboard.";
  if (normalized === "suspended_admin") return "Suspended by admin action. Contact support for reactivation.";
  if (normalized === "suspended_billing") return "Suspended for billing. Resolve payment to restore service.";
  if (normalized === "suspended") return "Access is suspended. Coordinate with admin team before reactivation.";
  return "Review tenant state and choose the next operational action.";
}

function subscriptionStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-100 text-emerald-800";
  if (normalized === "trialing" || normalized === "pending") return "bg-amber-100 text-amber-800";
  if (normalized === "past_due" || normalized === "paused") return "bg-orange-100 text-orange-800";
  if (normalized === "cancelled") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const jobId = searchParams.get("job") || undefined;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [backups, setBackups] = useState<BackupManifestEntry[]>([]);
  const [backupsSupported, setBackupsSupported] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditSupported, setAuditSupported] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit] = useState(25);
  const [auditTotal, setAuditTotal] = useState(0);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [membersSupported, setMembersSupported] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");
  const [inviting, setInviting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [domains, setDomains] = useState<DomainMapping[]>([]);
  const [domainsSupported, setDomainsSupported] = useState(true);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);
  const [removingDomainId, setRemovingDomainId] = useState<string | null>(null);
  const [supportNotes, setSupportNotes] = useState<SupportNote[]>([]);
  const [supportNotesSupported, setSupportNotesSupported] = useState(true);
  const [supportNotesError, setSupportNotesError] = useState<string | null>(null);
  const [supportNoteCategory, setSupportNoteCategory] = useState("note");
  const [supportNoteText, setSupportNoteText] = useState("");
  const [supportNoteOwner, setSupportNoteOwner] = useState("");
  const [supportNoteContact, setSupportNoteContact] = useState("");
  const [supportNoteDueAt, setSupportNoteDueAt] = useState("");
  const [supportNoteStatus, setSupportNoteStatus] = useState("open");
  const [supportNoteFilter, setSupportNoteFilter] = useState("all");
  const [savingSupportNote, setSavingSupportNote] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [recentJobsError, setRecentJobsError] = useState<string | null>(null);
  const [recentJobsSupported, setRecentJobsSupported] = useState(true);
  const [tenantSummary, setTenantSummary] = useState<TenantSummary | null>(null);
  const [tenantSummaryError, setTenantSummaryError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [subscriptionSupported, setSubscriptionSupported] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupManifestEntry | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  const loadTenant = useCallback(async () => {
    if (!id) return;
    try {
      const nextTenant = await api.getTenant(id);
      setTenant(nextTenant);
      setError(null);
    } catch (err) {
      if (isSessionExpiredError(err)) {
        setError("Session expired. Please log in again.");
      } else {
        setError(getApiErrorMessage(err, "Failed to load tenant"));
      }
      setTenant(null);
    }
  }, [id]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load profile"));
    }
  }, []);

  const retryProvisioning = useCallback(async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const result = await api.retryTenant(id);
      if (!result.supported) {
        setError("Retry endpoint is not available on this backend.");
        return;
      }
      await loadTenant();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to retry provisioning"));
    } finally {
      setRetrying(false);
    }
  }, [id, loadTenant]);

  const loadBackups = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.listTenantBackups(id);
      if (!result.supported) {
        setBackupsSupported(false);
        setBackups([]);
        return;
      }
      setBackupsSupported(true);
      setBackups(result.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load backup history"));
    }
  }, [id]);

  const loadAuditLog = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.listTenantAuditLog(id, auditPage, auditLimit);
      if (!result.supported) {
        setAuditSupported(false);
        setAuditLog([]);
        setAuditError(null);
        return;
      }
      setAuditSupported(true);
      setAuditLog(result.data.data);
      setAuditTotal(result.data.total);
      setAuditError(null);
    } catch (err) {
      setAuditError(getApiErrorMessage(err, "Failed to load activity log"));
    }
  }, [auditLimit, auditPage, id]);

  const loadMembers = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.listTenantMembers(id);
      if (!result.supported) {
        setMembersSupported(false);
        setMembers([]);
        setMembersError(null);
        return;
      }
      setMembersSupported(true);
      setMembers(result.data);
      setMembersError(null);
    } catch (err) {
      setMembersError(getApiErrorMessage(err, "Failed to load team members"));
    }
  }, [id]);

  const loadDomains = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.listTenantDomains(id);
      if (!result.supported) {
        setDomainsSupported(false);
        setDomains([]);
        setDomainsError(null);
        return;
      }
      setDomainsSupported(true);
      setDomains(result.data);
      setDomainsError(null);
    } catch (err) {
      setDomainsError(getApiErrorMessage(err, "Failed to load custom domains"));
    }
  }, [id]);

  const loadSupportNotes = useCallback(async () => {
    if (!id || currentUser?.role !== "admin") return;
    try {
      const result = await api.listSupportNotes(id);
      if (!result.supported) {
        setSupportNotesSupported(false);
        setSupportNotes([]);
        setSupportNotesError(null);
        return;
      }
      setSupportNotesSupported(true);
      setSupportNotes(result.data);
      setSupportNotesError(null);
    } catch (err) {
      setSupportNotesError(getApiErrorMessage(err, "Failed to load support notes"));
    }
  }, [currentUser?.role, id]);

  const loadRecentJobs = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.listAdminJobs(40);
      if (!result.supported) {
        setRecentJobsSupported(false);
        setRecentJobs([]);
        setRecentJobsError(null);
        return;
      }
      setRecentJobsSupported(true);
      const filtered = (result.data ?? []).filter((job) => job.tenant_id === id).slice(0, 5);
      setRecentJobs(filtered);
      setRecentJobsError(null);
    } catch (err) {
      setRecentJobsError(getApiErrorMessage(err, "Failed to load recent jobs"));
    }
  }, [id]);

  const loadTenantSummary = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.getTenantSummary(id);
      if (!result.supported) {
        setTenantSummary(null);
        setTenantSummaryError("Tenant summary endpoint not available.");
        return;
      }
      setTenantSummary(result.data);
      setTenantSummaryError(null);
    } catch (err) {
      setTenantSummaryError(getApiErrorMessage(err, "Failed to load tenant summary"));
    }
  }, [id]);

  const loadSubscription = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api.getTenantSubscription(id);
      if (!result.supported) {
        // AGENT-NOTE: older deployed API versions may not expose subscription endpoint yet.
        // Keep tenant operations page usable with a non-fatal fallback instead of hard failure.
        setSubscriptionSupported(false);
        setSubscription(null);
        setSubscriptionError(null);
        return;
      }
      setSubscriptionSupported(true);
      setSubscription(result.data);
      setSubscriptionError(null);
    } catch (err) {
      setSubscriptionError(getApiErrorMessage(err, "Failed to load subscription details"));
    }
  }, [id]);

  useEffect(() => {
    void loadTenant();
    void loadBackups();
    void loadAuditLog();
    void loadMembers();
    void loadDomains();
    void loadCurrentUser();
    void loadRecentJobs();
    void loadTenantSummary();
    void loadSubscription();
  }, [
    loadAuditLog,
    loadBackups,
    loadDomains,
    loadMembers,
    loadTenant,
    loadCurrentUser,
    loadRecentJobs,
    loadTenantSummary,
    loadSubscription,
  ]);

  useEffect(() => {
    void loadSupportNotes();
  }, [loadSupportNotes]);

  const buildSupportNoteExtras = () => {
    const extras: { owner_name?: string; owner_contact?: string; sla_due_at?: string; status?: string } = {};
    if (supportNoteOwner.trim()) extras.owner_name = supportNoteOwner.trim();
    if (supportNoteContact.trim()) extras.owner_contact = supportNoteContact.trim();
    if (supportNoteDueAt) {
      const parsed = new Date(supportNoteDueAt);
      if (!Number.isNaN(parsed.getTime())) {
        extras.sla_due_at = parsed.toISOString();
      }
    }
    if (supportNoteStatus.trim()) {
      extras.status = supportNoteStatus.trim();
    }
    return extras;
  };

  const getSlaState = (note: SupportNote) => {
    if (note.sla_state) return note.sla_state;
    if (note.status === "resolved") return "resolved";
    if (!note.sla_due_at) return "unscheduled";
    const due = new Date(note.sla_due_at);
    if (Number.isNaN(due.getTime())) return "unscheduled";
    const now = new Date();
    if (due < now) return "breached";
    const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 24) return "due_soon";
    return "on_track";
  };

  const filteredSupportNotes = useMemo(() => {
    if (supportNoteFilter === "all") return supportNotes;
    if (["breached", "due_soon", "on_track", "unscheduled"].includes(supportNoteFilter)) {
      return supportNotes.filter((note) => getSlaState(note) === supportNoteFilter);
    }
    return supportNotes.filter((note) => (note.status ?? "open") === supportNoteFilter);
  }, [supportNoteFilter, supportNotes]);

  useEffect(() => {
    setAuditPage(1);
  }, [id]);

  const sortedBackups = useMemo(
    () => [...backups].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))),
    [backups]
  );

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditLimit));
  const memberRoles = ["owner", "admin", "billing", "technical"];
  const isAdmin = currentUser?.role === "admin";

  if (!tenant) {
    return <p>{error ?? "Loading tenant..."}</p>;
  }

  return (
    <section className="space-y-6">
      <div id="overview" className="rounded-3xl border border-amber-200/70 bg-white/80 p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Tenant workspace</p>
                <h1 className="text-3xl font-semibold text-slate-900">{tenant.company_name}</h1>
                <p className="text-sm text-slate-600">Control-plane operational view for this customer workspace.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`https://${tenant.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#0d6a6a] px-4 py-2 text-xs font-semibold text-white"
                >
                  Open workspace
                </a>
                {tenant.status.toLowerCase() === "failed" ? (
                  <button
                    className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:border-amber-400 disabled:opacity-60"
                    disabled={retrying}
                    onClick={() => void retryProvisioning()}
                  >
                    {retrying ? "Retrying..." : "Retry provisioning"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold text-slate-700">
              {tenant.status}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
            <p className="text-xs uppercase tracking-wide text-slate-500">Plan</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{tenant.plan ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
            <p className="text-xs uppercase tracking-wide text-slate-500">Primary domain</p>
            <a
              href={`https://${tenant.domain}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-sm font-semibold text-[#0d6a6a] hover:text-[#0b5a5a]"
            >
              {tenant.domain}
            </a>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
            <p className="text-xs uppercase tracking-wide text-slate-500">Payment channel</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{tenant.payment_channel ?? "—"}</p>
          </div>
            </div>

            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Next step: {nextActionByStatus(tenant.status)}
            </p>
          </div>

          <aside className="space-y-3 rounded-3xl border border-amber-200/70 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Quick actions</p>
            <div className="space-y-2 text-xs text-slate-600">
              <button
                className="w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-amber-200 hover:bg-amber-50"
                onClick={() => navigator.clipboard.writeText(tenant.domain)}
              >
                Copy domain
              </button>
              {isAdmin ? (
                <>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                    placeholder="Reason (optional)"
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                  />
                  <button
                    className="w-full rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:border-red-300 disabled:opacity-60"
                    disabled={actionBusy}
                    onClick={async () => {
                      if (!tenant) return;
                      setActionBusy(true);
                      setActionError(null);
                      setActionNotice(null);
                      try {
                        const result = await api.suspendTenant(tenant.id, actionReason.trim() || undefined);
                        if (!result.supported) {
                          setActionError("Suspend action is not enabled on this backend.");
                          return;
                        }
                        setActionNotice("Tenant suspended successfully.");
                        await loadTenant();
                      } catch (err) {
                        setActionError(getApiErrorMessage(err, "Failed to suspend tenant."));
                      } finally {
                        setActionBusy(false);
                      }
                    }}
                  >
                    Suspend tenant
                  </button>
                  <button
                    className="w-full rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:border-emerald-300 disabled:opacity-60"
                    disabled={actionBusy}
                    onClick={async () => {
                      if (!tenant) return;
                      setActionBusy(true);
                      setActionError(null);
                      setActionNotice(null);
                      try {
                        const result = await api.unsuspendTenant(tenant.id, actionReason.trim() || undefined);
                        if (!result.supported) {
                          setActionError("Unsuspend action is not enabled on this backend.");
                          return;
                        }
                        setActionNotice("Tenant unsuspended successfully.");
                        await loadTenant();
                      } catch (err) {
                        setActionError(getApiErrorMessage(err, "Failed to unsuspend tenant."));
                      } finally {
                        setActionBusy(false);
                      }
                    }}
                  >
                    Unsuspend tenant
                  </button>
                </>
              ) : null}
              {actionNotice ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                  {actionNotice}
                </p>
              ) : null}
              {actionError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">{actionError}</p>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent operations</p>
                {tenantSummaryError ? (
                  <p className="mt-2 text-xs text-red-600">{tenantSummaryError}</p>
                ) : null}
                {recentJobsError ? (
                  <p className="mt-2 text-xs text-red-600">{recentJobsError}</p>
                ) : !recentJobsSupported ? (
                  <p className="mt-2 text-xs text-slate-500">Job history not available.</p>
                ) : recentJobs.length ? (
                  <div className="mt-2 space-y-2 text-xs text-slate-600">
                    {recentJobs.map((job) => (
                      <div key={job.id} className="rounded-xl border border-slate-200 px-2 py-1">
                        <p className="text-xs font-semibold text-slate-700">{job.type}</p>
                        <p className="text-[11px] text-slate-500">{formatTimestamp(job.created_at)}</p>
                        <p className="text-[11px] text-slate-500">Status: {job.status}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No recent jobs yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest backup</p>
                {tenantSummary?.last_backup ? (
                  <div className="mt-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">{formatTimestamp(tenantSummary.last_backup.created_at)}</p>
                    <p className="text-[11px] text-slate-500">
                      {tenantSummary.last_backup.file_size_bytes
                        ? `${tenantSummary.last_backup.file_size_bytes} bytes`
                        : "Size unknown"}
                    </p>
                  </div>
                ) : sortedBackups.length ? (
                  <div className="mt-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">
                      {formatTimestamp(typeof sortedBackups[0].created_at === "string" ? sortedBackups[0].created_at : null)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {sortedBackups[0].file_size_bytes ? `${sortedBackups[0].file_size_bytes} bytes` : "Size unknown"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No backup history yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest invoice</p>
                {tenantSummary?.last_invoice ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">
                      {formatCurrencyAmount(tenantSummary.last_invoice.amount_due, tenantSummary.last_invoice.currency)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Status: {tenantSummary.last_invoice.status || "unknown"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatTimestamp(tenantSummary.last_invoice.created_at || undefined)}
                    </p>
                    {tenantSummary.last_invoice.hosted_invoice_url ? (
                      <a
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                        href={tenantSummary.last_invoice.hosted_invoice_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View invoice
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No invoice data yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest activity</p>
                {tenantSummary?.last_audit ? (
                  <div className="mt-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">{tenantSummary.last_audit.action}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatTimestamp(tenantSummary.last_audit.created_at)}
                    </p>
                  </div>
                ) : auditLog.length ? (
                  <div className="mt-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">{auditLog[0].action}</p>
                    <p className="text-[11px] text-slate-500">{formatTimestamp(auditLog[0].created_at)}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No activity logged yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 rounded-3xl border border-amber-200/70 bg-white/80 p-3 text-xs text-slate-700">
        {[
          ["overview", "Overview"],
          ["subscription", "Subscription"],
          ["jobs", "Jobs"],
          ["backups", "Backups"],
          ["domains", "Domains"],
          ["team", "Team"],
          ["activity", "Activity log"],
          ["support", "Support notes"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-200 hover:bg-amber-50"
          >
            {label}
          </a>
        ))}
      </nav>

      <div id="subscription" className="space-y-2 rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Subscription details</h2>
          <button
            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300"
            onClick={() => {
              void loadSubscription();
            }}
          >
            Refresh
          </button>
        </div>

        {subscriptionError ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{subscriptionError}</p>
        ) : null}

        {!subscriptionSupported ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Subscription endpoint is not available on this backend deployment yet.
          </p>
        ) : subscription ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Plan</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{subscription.plan.display_name}</p>
              <p className="mt-1 text-xs text-slate-500">Isolation: {subscription.plan.isolation_model}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${subscriptionStatusClass(subscription.status)}`}>
                {subscription.status}
              </span>
              <p className="mt-1 text-xs text-slate-500">Provider: {subscription.payment_provider ?? "—"}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Billing period</p>
              <p className="mt-1 text-xs text-slate-700">
                {formatTimestamp(subscription.current_period_start)} → {formatTimestamp(subscription.current_period_end)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Next renewal: {formatTimestamp(subscription.current_period_end)}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Selected app</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{subscription.selected_app ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-500">Support: {subscription.plan.support_channel}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Trial ends</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(subscription.trial_ends_at)}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Cancelled at</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(subscription.cancelled_at)}</p>
            </article>
          </div>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            Loading subscription details...
          </p>
        )}
      </div>

      {jobId ? (
        <div id="jobs" className="space-y-2 rounded-3xl border border-amber-200/70 bg-white/80 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Realtime job progress</h2>
          <JobLogPanel jobId={jobId} />
        </div>
      ) : null}

      <div id="backups" className="space-y-2 rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Recovery backups</h2>
          <button
            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300"
            onClick={() => {
              void loadBackups();
            }}
          >
            Refresh
          </button>
        </div>

        {!backupsSupported ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Backup history endpoint is not available on this backend yet.
          </p>
        ) : sortedBackups.length ? (
          <>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Created</th>
                    <th className="p-2 text-left">Backup file</th>
                    <th className="p-2 text-left">Size</th>
                    <th className="p-2 text-left">Expires</th>
                    <th className="p-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBackups.map((entry, index) => {
                    const link = resolveBackupDownload(entry);
                    return (
                      <tr key={`${entry.id ?? entry.job_id ?? "backup"}-${index}`} className="border-t border-slate-200">
                        <td className="p-2">{formatTimestamp(typeof entry.created_at === "string" ? entry.created_at : null)}</td>
                        <td className="p-2">
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer" className="text-[#0d6a6a] hover:text-[#0b5a5a]">
                              {String(entry.file_path ?? "Download backup")}
                            </a>
                          ) : (
                            <span className="text-slate-400">{String(entry.file_path ?? "Unavailable")}</span>
                          )}
                        </td>
                        <td className="p-2">{typeof entry.file_size_bytes === "number" ? `${entry.file_size_bytes} bytes` : "—"}</td>
                        <td className="p-2">{formatTimestamp(typeof entry.expires_at === "string" ? entry.expires_at : null)}</td>
                        <td className="p-2">
                          <button
                            className="rounded-full border border-amber-200 px-3 py-1 text-xs text-slate-700 hover:border-amber-300 disabled:opacity-60"
                            disabled={!entry.id || restoreBusy}
                            onClick={() => {
                              setRestoreTarget(entry);
                              setRestoreConfirm("");
                              setRestoreError(null);
                              setRestoreNotice(null);
                            }}
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {restoreTarget ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold text-slate-900">Confirm restore</p>
                <p className="mt-1 text-xs text-slate-700">
                  Restoring will overwrite the current tenant database with the selected backup. Type{" "}
                  <span className="font-semibold">RESTORE</span> to continue.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                    value={restoreConfirm}
                    onChange={(event) => setRestoreConfirm(event.target.value)}
                    placeholder="RESTORE"
                  />
                  <button
                    className="rounded-full bg-[#0d6a6a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    disabled={restoreConfirm.trim() !== "RESTORE" || restoreBusy || !restoreTarget.id || !tenant}
                    onClick={async () => {
                      if (!tenant || !restoreTarget.id) return;
                      setRestoreBusy(true);
                      setRestoreError(null);
                      setRestoreNotice(null);
                      try {
                        const result = await api.restoreTenant(tenant.id, restoreTarget.id);
                        if (!result.supported) {
                          setRestoreError("Restore endpoint is not available on this backend.");
                          return;
                        }
                        setRestoreNotice("Restore queued. Monitor job logs for progress.");
                        setRestoreTarget(null);
                        setRestoreConfirm("");
                        if (result.data?.id) {
                          router.push(`/tenants/${tenant.id}?job=${result.data.id}`);
                        }
                      } catch (err) {
                        setRestoreError(getApiErrorMessage(err, "Failed to queue restore"));
                      } finally {
                        setRestoreBusy(false);
                      }
                    }}
                  >
                    {restoreBusy ? "Queuing..." : "Confirm restore"}
                  </button>
                  <button
                    className="rounded-full border border-amber-200 px-3 py-1.5 text-xs text-slate-700 hover:border-amber-300"
                    onClick={() => {
                      setRestoreTarget(null);
                      setRestoreConfirm("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {restoreError ? <p className="mt-2 text-xs text-red-700">{restoreError}</p> : null}
                {restoreNotice ? <p className="mt-2 text-xs text-emerald-800">{restoreNotice}</p> : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            No backup records yet. Trigger a backup from dashboard when you need a restore point.
          </p>
        )}
      </div>

      <div id="domains" className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Custom domains</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadDomains();
            }}
          >
            Refresh
          </button>
        </div>

        {!domainsSupported ? (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            Custom domain management is not available on this backend yet.
          </p>
        ) : domainsError ? (
          <p className="text-sm text-red-400">{domainsError}</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
              <h3 className="text-sm font-semibold text-slate-200">Add a custom domain</h3>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="example.com"
                  value={domainInput}
                  onChange={(event) => setDomainInput(event.target.value)}
                />
                <button
                  className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={addingDomain || !domainInput.trim()}
                  onClick={async () => {
                    if (!id) return;
                    setAddingDomain(true);
                    setDomainsError(null);
                    try {
                      const result = await api.createTenantDomain(id, domainInput.trim());
                      if (!result.supported) {
                        setDomainsSupported(false);
                        return;
                      }
                      setDomainInput("");
                      await loadDomains();
                    } catch (err) {
                      setDomainsError(getApiErrorMessage(err, "Failed to add domain"));
                    } finally {
                      setAddingDomain(false);
                    }
                  }}
                >
                  {addingDomain ? "Adding..." : "Add"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                After adding a domain, create a DNS TXT record with the verification token, then mark it verified.
              </p>
            </div>

            <div className="overflow-x-auto rounded border border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/60">
                  <tr>
                    <th className="p-2 text-left">Domain</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Verification token</th>
                    <th className="p-2 text-left">Verified at</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.length === 0 ? (
                    <tr>
                      <td className="p-3 text-sm text-slate-400" colSpan={5}>
                        No custom domains added yet.
                      </td>
                    </tr>
                  ) : (
                    domains.map((mapping) => (
                      <tr key={mapping.id} className="border-t border-slate-700">
                        <td className="p-2 text-xs text-slate-200">{mapping.domain}</td>
                        <td className="p-2 text-xs">
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              mapping.status === "verified"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {mapping.status}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-[11px] text-slate-400">{mapping.verification_token}</td>
                        <td className="p-2 text-xs text-slate-400">
                          {formatTimestamp(mapping.verified_at ?? null)}
                        </td>
                        <td className="p-2 text-xs">
                          <div className="flex flex-wrap gap-2">
                            {mapping.status !== "verified" ? (
                              <button
                                className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
                                disabled={verifyingDomainId === mapping.id}
                                onClick={async () => {
                                  if (!id) return;
                                  setVerifyingDomainId(mapping.id);
                                  setDomainsError(null);
                                  try {
                                    const result = await api.verifyTenantDomain(id, mapping.id, mapping.verification_token);
                                    if (!result.supported) {
                                      setDomainsSupported(false);
                                      return;
                                    }
                                    await loadDomains();
                                  } catch (err) {
                                    setDomainsError(getApiErrorMessage(err, "Failed to verify domain"));
                                  } finally {
                                    setVerifyingDomainId(null);
                                  }
                                }}
                              >
                                {verifyingDomainId === mapping.id ? "Verifying..." : "Mark verified"}
                              </button>
                            ) : null}
                            <button
                              className="rounded border border-slate-600 px-2 py-1 text-xs text-red-300 hover:bg-slate-800 disabled:opacity-60"
                              disabled={removingDomainId === mapping.id}
                              onClick={async () => {
                                if (!id) return;
                                setRemovingDomainId(mapping.id);
                                setDomainsError(null);
                                try {
                                  const result = await api.deleteTenantDomain(id, mapping.id);
                                  if (!result.supported) {
                                    setDomainsSupported(false);
                                    return;
                                  }
                                  await loadDomains();
                                } catch (err) {
                                  setDomainsError(getApiErrorMessage(err, "Failed to remove domain"));
                                } finally {
                                  setRemovingDomainId(null);
                                }
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div id="team" className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Team</h2>
          <button
            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300"
            onClick={() => {
              void loadMembers();
            }}
          >
            Refresh
          </button>
        </div>

        {!membersSupported ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Team management is not available on this backend yet.
          </p>
        ) : membersError ? (
          <p className="text-sm text-red-600">{membersError}</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Invite teammate</h3>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  {memberRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                  disabled={inviting || !inviteEmail.trim()}
                  onClick={async () => {
                    if (!id) return;
                    setInviting(true);
                    setMembersError(null);
                    try {
                      const result = await api.inviteTenantMember(id, {
                        email: inviteEmail.trim(),
                        role: inviteRole,
                      });
                      if (!result.supported) {
                        setMembersError("Team invitation endpoint is not available on this backend.");
                        return;
                      }
                      setInviteEmail("");
                      await loadMembers();
                    } catch (err) {
                      setMembersError(getApiErrorMessage(err, "Failed to invite member"));
                    } finally {
                      setInviting(false);
                    }
                  }}
                >
                  Invite
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Role</th>
                    <th className="p-2 text-left">Joined</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td className="p-3 text-sm text-slate-500" colSpan={4}>
                        No team members yet.
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => (
                      <tr key={member.id} className="border-t border-slate-200">
                        <td className="p-2 text-xs text-slate-700">{member.user_email || member.user_id}</td>
                        <td className="p-2 text-xs">
                          {member.role === "owner" ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">owner</span>
                          ) : (
                            <select
                              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                              value={member.role}
                              onChange={async (event) => {
                                if (!id) return;
                                const nextRole = event.target.value;
                                setUpdatingMemberId(member.id);
                                setMembersError(null);
                                try {
                                  const result = await api.updateTenantMemberRole(id, member.id, nextRole);
                                  if (!result.supported) {
                                    setMembersError("Member update endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadMembers();
                                } catch (err) {
                                  setMembersError(getApiErrorMessage(err, "Failed to update member role"));
                                } finally {
                                  setUpdatingMemberId(null);
                                }
                              }}
                              disabled={updatingMemberId === member.id}
                            >
                              {memberRoles.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="p-2 text-xs text-slate-500">{formatTimestamp(member.created_at)}</td>
                        <td className="p-2 text-xs">
                          {member.role === "owner" ? (
                            <span className="text-slate-500">Owner</span>
                          ) : (
                            <button
                              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:border-red-300 disabled:opacity-60"
                              disabled={removingMemberId === member.id}
                              onClick={async () => {
                                if (!id) return;
                                setRemovingMemberId(member.id);
                                setMembersError(null);
                                try {
                                  const result = await api.removeTenantMember(id, member.id);
                                  if (!result.supported) {
                                    setMembersError("Member removal endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadMembers();
                                } catch (err) {
                                  setMembersError(getApiErrorMessage(err, "Failed to remove member"));
                                } finally {
                                  setRemovingMemberId(null);
                                }
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Custom domains</h2>
          <button
            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300"
            onClick={() => {
              void loadDomains();
            }}
          >
            Refresh
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-600">
          Add a branded domain. Point a CNAME record at <span className="font-semibold text-slate-900">{tenant.domain}</span>, then verify
          once DNS has propagated.
        </p>

        {!domainsSupported ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Custom domain management is not available on this backend yet.
          </p>
        ) : domainsError ? (
          <p className="text-sm text-red-600">{domainsError}</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Add custom domain</h3>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  placeholder="e.g. erp.example.com"
                  value={domainInput}
                  onChange={(event) => setDomainInput(event.target.value)}
                />
                <button
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                  disabled={addingDomain || !domainInput.trim()}
                  onClick={async () => {
                    if (!id) return;
                    setAddingDomain(true);
                    setDomainsError(null);
                    try {
                      const result = await api.createTenantDomain(id, domainInput.trim());
                      if (!result.supported) {
                        setDomainsError("Custom domain endpoint is not available on this backend.");
                        return;
                      }
                      setDomainInput("");
                      await loadDomains();
                    } catch (err) {
                      setDomainsError(getApiErrorMessage(err, "Failed to add domain"));
                    } finally {
                      setAddingDomain(false);
                    }
                  }}
                >
                  {addingDomain ? "Adding..." : "Add domain"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Domain</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Added</th>
                    <th className="p-2 text-left">Verified</th>
                    <th className="p-2 text-left">Token</th>
                    <th className="p-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.length === 0 ? (
                    <tr>
                      <td className="p-3 text-sm text-slate-500" colSpan={6}>
                        No custom domains added yet.
                      </td>
                    </tr>
                  ) : (
                    domains.map((domain) => (
                      <tr key={domain.id} className="border-t border-slate-200">
                        <td className="p-2 text-xs text-slate-700">{domain.domain}</td>
                        <td className="p-2 text-xs">
                          <span className={`rounded-full px-2 py-1 text-xs ${domainStatusClass(domain.status)}`}>
                            {domain.status}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-slate-500">{formatTimestamp(domain.created_at)}</td>
                        <td className="p-2 text-xs text-slate-500">{formatTimestamp(domain.verified_at)}</td>
                        <td className="p-2 text-xs text-slate-500">{domain.verification_token}</td>
                        <td className="p-2 text-xs">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:border-emerald-300 disabled:opacity-60"
                              disabled={domain.status === "verified" || verifyingDomainId === domain.id}
                              onClick={async () => {
                                if (!id) return;
                                setVerifyingDomainId(domain.id);
                                setDomainsError(null);
                                try {
                                  const result = await api.verifyTenantDomain(id, domain.id, domain.verification_token);
                                  if (!result.supported) {
                                    setDomainsError("Domain verification endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadDomains();
                                } catch (err) {
                                  setDomainsError(getApiErrorMessage(err, "Failed to verify domain"));
                                } finally {
                                  setVerifyingDomainId(null);
                                }
                              }}
                            >
                              {verifyingDomainId === domain.id ? "Verifying..." : "Verify"}
                            </button>
                            <button
                              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:border-red-300 disabled:opacity-60"
                              disabled={removingDomainId === domain.id}
                              onClick={async () => {
                                if (!id) return;
                                setRemovingDomainId(domain.id);
                                setDomainsError(null);
                                try {
                                  const result = await api.deleteTenantDomain(id, domain.id);
                                  if (!result.supported) {
                                    setDomainsError("Domain removal endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadDomains();
                                } catch (err) {
                                  setDomainsError(getApiErrorMessage(err, "Failed to remove domain"));
                                } finally {
                                  setRemovingDomainId(null);
                                }
                              }}
                            >
                              {removingDomainId === domain.id ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isAdmin ? (
        <div id="support" className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Support notes</h2>
            <button
              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300"
              onClick={() => {
                void loadSupportNotes();
              }}
            >
              Refresh
            </button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>Filter:</span>
            {["all", "open", "monitoring", "resolved", "due_soon", "breached"].map((option) => (
              <button
                key={option}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  supportNoteFilter === option
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50"
                }`}
                onClick={() => setSupportNoteFilter(option)}
              >
                {option.replace("_", " ")}
              </button>
            ))}
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Internal notes are visible to platform admins only. Use them to track incidents, billing context, or key follow-ups.
          </p>

          {!supportNotesSupported ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Support notes are not available on this backend yet.
            </p>
          ) : supportNotesError ? (
            <p className="text-sm text-red-600">{supportNotesError}</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Add support note</h3>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      value={supportNoteCategory}
                      onChange={(event) => setSupportNoteCategory(event.target.value)}
                    >
                      <option value="note">Note</option>
                      <option value="incident">Incident</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="billing">Billing</option>
                    </select>
                    <select
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      value={supportNoteStatus}
                      onChange={(event) => setSupportNoteStatus(event.target.value)}
                    >
                      {["open", "monitoring", "resolved"].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <input
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      placeholder="Owner name"
                      value={supportNoteOwner}
                      onChange={(event) => setSupportNoteOwner(event.target.value)}
                    />
                    <input
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      placeholder="Contact (phone/WhatsApp/email)"
                      value={supportNoteContact}
                      onChange={(event) => setSupportNoteContact(event.target.value)}
                    />
                    <input
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      type="datetime-local"
                      value={supportNoteDueAt}
                      onChange={(event) => setSupportNoteDueAt(event.target.value)}
                    />
                    <button
                      className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
                      disabled={savingSupportNote || !supportNoteText.trim()}
                      onClick={async () => {
                        if (!id) return;
                        setSavingSupportNote(true);
                        setSupportNotesError(null);
                        try {
                          const result = await api.createSupportNote(
                            id,
                            supportNoteCategory,
                            supportNoteText.trim(),
                            buildSupportNoteExtras()
                          );
                          if (!result.supported) {
                            setSupportNotesError("Support note endpoint is not available on this backend.");
                            return;
                          }
                          setSupportNoteText("");
                          await loadSupportNotes();
                        } catch (err) {
                          setSupportNotesError(getApiErrorMessage(err, "Failed to save note"));
                        } finally {
                          setSavingSupportNote(false);
                        }
                      }}
                    >
                      {savingSupportNote ? "Saving..." : "Save note"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>Filter notes:</span>
                    {["all", "open", "monitoring", "resolved", "due_soon", "breached"].map((option) => (
                      <button
                        key={option}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          supportNoteFilter === option
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50"
                        }`}
                        onClick={() => setSupportNoteFilter(option)}
                      >
                        {option.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="min-h-[90px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    placeholder="Record the support context, decisions, and next steps."
                    value={supportNoteText}
                    onChange={(event) => setSupportNoteText(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {supportNotes.length === 0 ? (
                  <p className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    No support notes yet.
                  </p>
                ) : (
                  filteredSupportNotes.map((note) => (
                    <div key={note.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{note.category}</span>
                        <span className="text-xs text-slate-500">{formatTimestamp(note.created_at)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span>Status: {note.status ?? "open"}</span>
                        <span className="rounded-full border border-slate-200 px-2 py-0.5">
                          SLA: {getSlaState(note).replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-2 text-slate-700">{note.note}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Owner: {note.owner_name || "—"} {note.owner_contact ? `• ${note.owner_contact}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        SLA due: {note.sla_due_at ? formatTimestamp(note.sla_due_at) : "—"}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {note.author_email || note.author_role || "admin"} • {note.author_role}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <button
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-amber-200 hover:bg-amber-50 disabled:opacity-60"
                          disabled={savingSupportNote}
                          onClick={async () => {
                            if (!note.id) return;
                            setSavingSupportNote(true);
                            try {
                              const result = await api.updateSupportNote(note.id, {
                                status: note.status === "resolved" ? "open" : "resolved",
                              });
                              if (!result.supported) {
                                setSupportNotesSupported(false);
                                return;
                              }
                              await loadSupportNotes();
                            } catch (err) {
                              setSupportNotesError(getApiErrorMessage(err, "Failed to update support note"));
                            } finally {
                              setSavingSupportNote(false);
                            }
                          }}
                        >
                          {note.status === "resolved" ? "Reopen" : "Mark resolved"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div id="activity" className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Activity log</h2>
          <button
            className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-amber-300"
            onClick={() => {
              void loadAuditLog();
            }}
          >
            Refresh
          </button>
        </div>

        {!auditSupported ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Activity log endpoint is not available on this backend yet.
          </p>
        ) : auditError ? (
          <p className="text-sm text-red-600">{auditError}</p>
        ) : auditLog.length ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 text-left">Time</th>
                  <th className="p-2 text-left">Actor</th>
                  <th className="p-2 text-left">Action</th>
                  <th className="p-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200">
                    <td className="p-2 text-xs text-slate-700">{formatTimestamp(entry.created_at)}</td>
                    <td className="p-2 text-xs text-slate-700">
                      {entry.actor_email || entry.actor_id || entry.actor_role}
                    </td>
                    <td className="p-2 text-xs">{entry.action}</td>
                    <td className="p-2 text-xs text-slate-500">{entry.ip_address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            No activity recorded yet.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Page {auditPage} of {auditTotalPages} • {auditTotal} events
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-amber-200 hover:bg-amber-50 disabled:opacity-60"
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-amber-200 hover:bg-amber-50 disabled:opacity-60"
              disabled={auditPage >= auditTotalPages}
              onClick={() => setAuditPage((prev) => Math.min(auditTotalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
