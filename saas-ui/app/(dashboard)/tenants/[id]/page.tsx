"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { JobLogPanel } from "../../../../domains/shared/components/JobLogPanel";
import { api, getApiErrorMessage, isSessionExpiredError } from "../../../../domains/shared/lib/api";
import type {
  AuditLogEntry,
  BackupManifestEntry,
  DomainMapping,
  SupportNote,
  Tenant,
  TenantMember,
  UserProfile,
} from "../../../../domains/shared/lib/types";

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-500/20 text-emerald-300";
  if (["provisioning", "pending", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized)) {
    return "bg-amber-500/20 text-amber-300";
  }
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  if (normalized === "deleted") return "bg-slate-500/20 text-slate-300";
  if (["suspended", "suspended_admin", "suspended_billing"].includes(normalized)) return "bg-orange-500/20 text-orange-300";
  return "bg-sky-500/20 text-sky-300";
}

function domainStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "verified") return "bg-emerald-500/20 text-emerald-300";
  if (normalized === "pending") return "bg-amber-500/20 text-amber-300";
  if (normalized === "failed") return "bg-red-500/20 text-red-300";
  return "bg-slate-700 text-slate-200";
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
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
  const [savingSupportNote, setSavingSupportNote] = useState(false);

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

  useEffect(() => {
    void loadTenant();
    void loadBackups();
    void loadAuditLog();
    void loadMembers();
    void loadDomains();
    void loadCurrentUser();
  }, [loadAuditLog, loadBackups, loadDomains, loadMembers, loadTenant, loadCurrentUser]);

  useEffect(() => {
    void loadSupportNotes();
  }, [loadSupportNotes]);

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
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{tenant.company_name}</h1>
            <p>
              Health:{" "}
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(tenant.status)}`}>
                {tenant.status}
              </span>
            </p>
            <p>
              Workspace URL:{" "}
              <a href={`https://${tenant.domain}`} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                {tenant.domain}
              </a>
            </p>
          </div>
          <a
            href={`https://${tenant.domain}`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800"
          >
            Open workspace
          </a>
          {tenant.status.toLowerCase() === "failed" ? (
            <button
              className="rounded border border-amber-500 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
              disabled={retrying}
              onClick={() => void retryProvisioning()}
            >
              {retrying ? "Retrying..." : "Retry provisioning"}
            </button>
          ) : null}
        </div>
        <p className="mt-3 rounded border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
          Next step: {nextActionByStatus(tenant.status)}
        </p>
      </div>

      {jobId ? (
        <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h2 className="text-lg font-semibold">Realtime job progress</h2>
          <JobLogPanel jobId={jobId} />
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Recovery backups</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadBackups();
            }}
          >
            Refresh
          </button>
        </div>

        {!backupsSupported ? (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            Backup history endpoint is not available on this backend yet.
          </p>
        ) : sortedBackups.length ? (
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="p-2 text-left">Created</th>
                  <th className="p-2 text-left">Backup file</th>
                  <th className="p-2 text-left">Size</th>
                  <th className="p-2 text-left">Expires</th>
                </tr>
              </thead>
              <tbody>
                {sortedBackups.map((entry, index) => {
                  const link = resolveBackupDownload(entry);
                  return (
                    <tr key={`${entry.id ?? entry.job_id ?? "backup"}-${index}`} className="border-t border-slate-700">
                      <td className="p-2">{formatTimestamp(typeof entry.created_at === "string" ? entry.created_at : null)}</td>
                      <td className="p-2">
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                            {String(entry.file_path ?? "Download backup")}
                          </a>
                        ) : (
                          <span className="text-slate-400">{String(entry.file_path ?? "Unavailable")}</span>
                        )}
                      </td>
                      <td className="p-2">{typeof entry.file_size_bytes === "number" ? `${entry.file_size_bytes} bytes` : "—"}</td>
                      <td className="p-2">{formatTimestamp(typeof entry.expires_at === "string" ? entry.expires_at : null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            No backup records yet. Trigger a backup from dashboard when you need a restore point.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Custom domains</h2>
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

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Team</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadMembers();
            }}
          >
            Refresh
          </button>
        </div>

        {!membersSupported ? (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            Team management is not available on this backend yet.
          </p>
        ) : membersError ? (
          <p className="text-sm text-red-400">{membersError}</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
              <h3 className="text-sm font-semibold text-slate-200">Invite teammate</h3>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Email address"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
                <select
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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
                  className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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

            <div className="overflow-x-auto rounded border border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/60">
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
                      <td className="p-3 text-sm text-slate-400" colSpan={4}>
                        No team members yet.
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => (
                      <tr key={member.id} className="border-t border-slate-700">
                        <td className="p-2 text-xs text-slate-200">{member.user_email || member.user_id}</td>
                        <td className="p-2 text-xs">
                          {member.role === "owner" ? (
                            <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">owner</span>
                          ) : (
                            <select
                              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
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
                        <td className="p-2 text-xs text-slate-400">{formatTimestamp(member.created_at)}</td>
                        <td className="p-2 text-xs">
                          {member.role === "owner" ? (
                            <span className="text-slate-500">Owner</span>
                          ) : (
                            <button
                              className="rounded border border-slate-600 px-2 py-1 text-xs text-red-300 hover:bg-slate-800 disabled:opacity-60"
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

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Custom domains</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadDomains();
            }}
          >
            Refresh
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          Add a branded domain. Point a CNAME record at <span className="text-slate-200">{tenant.domain}</span>, then verify
          once DNS has propagated.
        </p>

        {!domainsSupported ? (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            Custom domain management is not available on this backend yet.
          </p>
        ) : domainsError ? (
          <p className="text-sm text-red-400">{domainsError}</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
              <h3 className="text-sm font-semibold text-slate-200">Add custom domain</h3>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="e.g. erp.example.com"
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

            <div className="overflow-x-auto rounded border border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/60">
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
                      <td className="p-3 text-sm text-slate-400" colSpan={6}>
                        No custom domains added yet.
                      </td>
                    </tr>
                  ) : (
                    domains.map((domain) => (
                      <tr key={domain.id} className="border-t border-slate-700">
                        <td className="p-2 text-xs text-slate-200">{domain.domain}</td>
                        <td className="p-2 text-xs">
                          <span className={`rounded px-2 py-1 text-xs ${domainStatusClass(domain.status)}`}>
                            {domain.status}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-slate-400">{formatTimestamp(domain.created_at)}</td>
                        <td className="p-2 text-xs text-slate-400">{formatTimestamp(domain.verified_at)}</td>
                        <td className="p-2 text-xs text-slate-400">{domain.verification_token}</td>
                        <td className="p-2 text-xs">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded border border-slate-600 px-2 py-1 text-xs text-emerald-200 hover:bg-slate-800 disabled:opacity-60"
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
                              className="rounded border border-slate-600 px-2 py-1 text-xs text-red-300 hover:bg-slate-800 disabled:opacity-60"
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
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Support notes</h2>
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
              onClick={() => {
                void loadSupportNotes();
              }}
            >
              Refresh
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Internal notes are visible to platform admins only. Use them to track incidents, billing context, or key follow-ups.
          </p>

          {!supportNotesSupported ? (
            <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
              Support notes are not available on this backend yet.
            </p>
          ) : supportNotesError ? (
            <p className="text-sm text-red-400">{supportNotesError}</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
                <h3 className="text-sm font-semibold text-slate-200">Add support note</h3>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={supportNoteCategory}
                      onChange={(event) => setSupportNoteCategory(event.target.value)}
                    >
                      <option value="note">Note</option>
                      <option value="incident">Incident</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="billing">Billing</option>
                    </select>
                    <button
                      className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      disabled={savingSupportNote || !supportNoteText.trim()}
                      onClick={async () => {
                        if (!id) return;
                        setSavingSupportNote(true);
                        setSupportNotesError(null);
                        try {
                          const result = await api.createSupportNote(id, supportNoteCategory, supportNoteText.trim());
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
                  <textarea
                    className="min-h-[90px] w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    placeholder="Record the support context, decisions, and next steps."
                    value={supportNoteText}
                    onChange={(event) => setSupportNoteText(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {supportNotes.length === 0 ? (
                  <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
                    No support notes yet.
                  </p>
                ) : (
                  supportNotes.map((note) => (
                    <div key={note.id} className="rounded border border-slate-700 bg-slate-950/60 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">{note.category}</span>
                        <span className="text-xs text-slate-400">{formatTimestamp(note.created_at)}</span>
                      </div>
                      <p className="mt-2 text-slate-200">{note.note}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        {note.author_email || note.author_role || "admin"} • {note.author_role}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Activity log</h2>
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => {
              void loadAuditLog();
            }}
          >
            Refresh
          </button>
        </div>

        {!auditSupported ? (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            Activity log endpoint is not available on this backend yet.
          </p>
        ) : auditError ? (
          <p className="text-sm text-red-400">{auditError}</p>
        ) : auditLog.length ? (
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="p-2 text-left">Time</th>
                  <th className="p-2 text-left">Actor</th>
                  <th className="p-2 text-left">Action</th>
                  <th className="p-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-700">
                    <td className="p-2 text-xs text-slate-300">{formatTimestamp(entry.created_at)}</td>
                    <td className="p-2 text-xs text-slate-300">
                      {entry.actor_email || entry.actor_id || entry.actor_role}
                    </td>
                    <td className="p-2 text-xs">{entry.action}</td>
                    <td className="p-2 text-xs text-slate-400">{entry.ip_address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
            No activity recorded yet.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Page {auditPage} of {auditTotalPages} • {auditTotal} events
          </span>
          <div className="flex gap-2">
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-60"
              disabled={auditPage >= auditTotalPages}
              onClick={() => setAuditPage((prev) => Math.min(auditTotalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Support notes</h2>
            <button
              className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
              onClick={() => {
                void loadSupportNotes();
              }}
            >
              Refresh
            </button>
          </div>

          {!supportNotesSupported ? (
            <p className="rounded border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-300">
              Support notes are not available on this backend yet.
            </p>
          ) : supportNotesError ? (
            <p className="text-sm text-red-400">{supportNotesError}</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
                <h3 className="text-sm font-semibold text-slate-200">Add note</h3>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <select
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={supportNoteCategory}
                    onChange={(event) => setSupportNoteCategory(event.target.value)}
                  >
                    {["note", "incident", "risk"].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    placeholder="What happened, next steps, or key context"
                    value={supportNoteText}
                    onChange={(event) => setSupportNoteText(event.target.value)}
                  />
                  <button
                    className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={savingSupportNote || !supportNoteText.trim()}
                    onClick={async () => {
                      if (!id) return;
                      setSavingSupportNote(true);
                      setSupportNotesError(null);
                      try {
                        const result = await api.createSupportNote(id, supportNoteCategory, supportNoteText.trim());
                        if (!result.supported) {
                          setSupportNotesSupported(false);
                          return;
                        }
                        setSupportNoteText("");
                        await loadSupportNotes();
                      } catch (err) {
                        setSupportNotesError(getApiErrorMessage(err, "Failed to add support note"));
                      } finally {
                        setSavingSupportNote(false);
                      }
                    }}
                  >
                    {savingSupportNote ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-900/60">
                    <tr>
                      <th className="p-2 text-left">Time</th>
                      <th className="p-2 text-left">Author</th>
                      <th className="p-2 text-left">Category</th>
                      <th className="p-2 text-left">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supportNotes.length === 0 ? (
                      <tr>
                        <td className="p-3 text-sm text-slate-400" colSpan={4}>
                          No support notes yet.
                        </td>
                      </tr>
                    ) : (
                      supportNotes.map((note) => (
                        <tr key={note.id} className="border-t border-slate-700">
                          <td className="p-2 text-xs text-slate-300">{formatTimestamp(note.created_at)}</td>
                          <td className="p-2 text-xs text-slate-300">{note.author_email || note.author_role}</td>
                          <td className="p-2 text-xs text-slate-300">{note.category}</td>
                          <td className="p-2 text-xs text-slate-200">{note.note}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
