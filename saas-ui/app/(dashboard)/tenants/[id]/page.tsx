"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { JobLogPanel } from "../../../../domains/shared/components/JobLogPanel";
import {
  TenantActivitySection,
  TenantSectionLinks,
  TenantSubscriptionSection,
} from "../../../../domains/tenant-ops/ui/tenant-detail/sections";
import {
  createTenantDomain,
  createTenantSupportNote,
  deleteTenantDomain,
  inviteTenantMember,
  isTenantDetailSessionExpired,
  loadTenantAuditEvents,
  loadTenantBackupManifest,
  loadTenantCurrentUser,
  loadTenantDetail,
  loadTenantDomains as loadTenantDomainsUseCase,
  loadTenantMembers as loadTenantMembersUseCase,
  loadTenantRecentJobs,
  loadTenantSubscription as loadTenantSubscriptionUseCase,
  loadTenantSummary as loadTenantSummaryUseCase,
  loadTenantSupportNotes as loadTenantSupportNotesUseCase,
  removeTenantMember,
  restoreTenantFromBackup,
  retryTenantProvisioningAction,
  suspendTenantAccess,
  toTenantDetailErrorMessage,
  unsuspendTenantAccess,
  updateTenantMemberRole,
  updateTenantSupportNote,
  verifyTenantDomain,
} from "../../../../domains/tenant-ops/application/tenantDetailUseCases";
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

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

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

const sectionPaperSx = {
  p: 3,
  borderRadius: 4,
  borderColor: "warning.light",
  backgroundColor: "background.paper",
};

type TenantDetailSectionAnchor = "overview" | "team" | "domains" | "subscription" | "jobs" | "activity" | "backups" | "support";

const routeSectionToAnchor: Record<string, TenantDetailSectionAnchor> = {
  overview: "overview",
  members: "team",
  domains: "domains",
  billing: "subscription",
  jobs: "jobs",
  audit: "activity",
  backups: "backups",
  support: "support",
};

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname() ?? "";
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

  const initialSection = useMemo<TenantDetailSectionAnchor | null>(() => {
    if (!id) return null;
    const normalizedPath = pathname.replace(/\/+$/, "");
    const segments = normalizedPath.split("/").filter(Boolean);
    const finalSegment = segments.at(-1);
    if (!finalSegment || finalSegment === id) return null;
    return routeSectionToAnchor[finalSegment] ?? null;
  }, [id, pathname]);

  useEffect(() => {
    if (!initialSection) return;
    const section = document.getElementById(initialSection);
    if (!section) return;
    section.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [initialSection]);

  const loadTenant = useCallback(async () => {
    if (!id) return;
    try {
      const nextTenant = await loadTenantDetail(id);
      setTenant(nextTenant);
      setError(null);
    } catch (err) {
      if (isTenantDetailSessionExpired(err)) {
        setError("Session expired. Please log in again.");
      } else {
        setError(toTenantDetailErrorMessage(err, "Failed to load tenant"));
      }
      setTenant(null);
    }
  }, [id]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await loadTenantCurrentUser();
      setCurrentUser(user);
    } catch (err) {
      setError(toTenantDetailErrorMessage(err, "Failed to load profile"));
    }
  }, []);

  const retryProvisioning = useCallback(async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const result = await retryTenantProvisioningAction(id);
      if (!result.supported) {
        setError("Retry endpoint is not available on this backend.");
        return;
      }
      await loadTenant();
    } catch (err) {
      setError(toTenantDetailErrorMessage(err, "Failed to retry provisioning"));
    } finally {
      setRetrying(false);
    }
  }, [id, loadTenant]);

  const loadBackups = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantBackupManifest(id);
      if (!result.supported) {
        setBackupsSupported(false);
        setBackups([]);
        return;
      }
      setBackupsSupported(true);
      setBackups(result.data);
    } catch (err) {
      setError(toTenantDetailErrorMessage(err, "Failed to load backup history"));
    }
  }, [id]);

  const loadAuditLog = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantAuditEvents(id, auditPage, auditLimit);
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
      setAuditError(toTenantDetailErrorMessage(err, "Failed to load activity log"));
    }
  }, [auditLimit, auditPage, id]);

  const loadMembers = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantMembersUseCase(id);
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
      setMembersError(toTenantDetailErrorMessage(err, "Failed to load team members"));
    }
  }, [id]);

  const loadDomains = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantDomainsUseCase(id);
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
      setDomainsError(toTenantDetailErrorMessage(err, "Failed to load custom domains"));
    }
  }, [id]);

  const loadSupportNotes = useCallback(async () => {
    if (!id || currentUser?.role !== "admin") return;
    try {
      const result = await loadTenantSupportNotesUseCase(id);
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
      setSupportNotesError(toTenantDetailErrorMessage(err, "Failed to load support notes"));
    }
  }, [currentUser?.role, id]);

  const loadRecentJobs = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantRecentJobs(id, 40, 5);
      if (!result.supported) {
        setRecentJobsSupported(false);
        setRecentJobs([]);
        setRecentJobsError(null);
        return;
      }
      setRecentJobsSupported(true);
      setRecentJobs(result.data ?? []);
      setRecentJobsError(null);
    } catch (err) {
      setRecentJobsError(toTenantDetailErrorMessage(err, "Failed to load recent jobs"));
    }
  }, [id]);

  const loadTenantSummary = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantSummaryUseCase(id);
      if (!result.supported) {
        setTenantSummary(null);
        setTenantSummaryError("Tenant summary endpoint not available.");
        return;
      }
      setTenantSummary(result.data);
      setTenantSummaryError(null);
    } catch (err) {
      setTenantSummaryError(toTenantDetailErrorMessage(err, "Failed to load tenant summary"));
    }
  }, [id]);

  const loadSubscription = useCallback(async () => {
    if (!id) return;
    try {
      const result = await loadTenantSubscriptionUseCase(id);
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
      setSubscriptionError(toTenantDetailErrorMessage(err, "Failed to load subscription details"));
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

  const activeRecentJob = useMemo(
    () => recentJobs.find((job) => !TERMINAL_JOB_STATUSES.has((job.status || "").toLowerCase())),
    [recentJobs]
  );
  const liveJobId = jobId || activeRecentJob?.id;

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
    return (
      <Typography color={error ? "error" : "text.secondary"}>
        {error ?? "Loading tenant..."}
      </Typography>
    );
  }

  return (
    <Box component="section" sx={{ display: "grid", gap: 3 }}>
      <Paper id="overview" variant="outlined" sx={sectionPaperSx}>
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 260px" },
          }}
        >
          <Box>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ md: "flex-start" }}
              justifyContent="space-between"
            >
              <Stack spacing={1}>
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "warning.dark" }}>
                  Tenant workspace
                </Typography>
                <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
                  {tenant.company_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Control-plane operational view for this customer workspace.
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                  component="a"
                  href={`https://${tenant.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  variant="contained"
                  size="small"
                  sx={{ borderRadius: 99, px: 2, py: 1, textTransform: "none", fontWeight: 700, bgcolor: "#0d6a6a" }}
                >
                  Open workspace
                </Button>
                {tenant.status.toLowerCase() === "failed" ? (
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={retrying}
                    onClick={() => void retryProvisioning()}
                    sx={{
                      borderRadius: 99,
                      textTransform: "none",
                      fontWeight: 700,
                      color: "warning.dark",
                      borderColor: "warning.light",
                      bgcolor: "warning.50",
                    }}
                  >
                    {retrying ? "Retrying..." : "Retry provisioning"}
                  </Button>
                ) : null}
              </Stack>
            </Stack>

            <Box sx={{ mt: 3, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0,1fr))" } }}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Status
                  </Typography>
                  <Chip label={tenant.status} size="small" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Plan
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                    {tenant.plan ?? "—"}
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Primary domain
                  </Typography>
                  <Link
                    href={`https://${tenant.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                    sx={{ mt: 1, display: "inline-block", fontWeight: 700, color: "#0d6a6a" }}
                  >
                    {tenant.domain}
                  </Link>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Payment channel
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>
                    {tenant.payment_channel ?? "—"}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            <Alert severity="warning" sx={{ mt: 3 }}>
              Next step: {nextActionByStatus(tenant.status)}
            </Alert>
          </Box>

          <Paper
            variant="outlined"
            component="aside"
            sx={{
              p: 2,
              borderRadius: 4,
              borderColor: "warning.light",
              bgcolor: "background.paper",
              alignSelf: { lg: "start" },
              position: { lg: "sticky" },
              top: { lg: 96 },
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "warning.dark" }}>
              Quick actions
            </Typography>
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => navigator.clipboard.writeText(tenant.domain)}
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
              >
                Copy domain
              </Button>
              {isAdmin ? (
                <>
                  <TextField
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                    placeholder="Reason (optional)"
                    size="small"
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={actionBusy}
                    onClick={async () => {
                      if (!tenant) return;
                      setActionBusy(true);
                      setActionError(null);
                      setActionNotice(null);
                      try {
                        const result = await suspendTenantAccess(tenant.id, actionReason.trim() || undefined);
                        if (!result.supported) {
                          setActionError("Suspend action is not enabled on this backend.");
                          return;
                        }
                        setActionNotice("Tenant suspended successfully.");
                        await loadTenant();
                      } catch (err) {
                        setActionError(toTenantDetailErrorMessage(err, "Failed to suspend tenant."));
                      } finally {
                        setActionBusy(false);
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                  >
                    Suspend tenant
                  </Button>
                  <Button
                    variant="outlined"
                    color="success"
                    disabled={actionBusy}
                    onClick={async () => {
                      if (!tenant) return;
                      setActionBusy(true);
                      setActionError(null);
                      setActionNotice(null);
                      try {
                        const result = await unsuspendTenantAccess(tenant.id, actionReason.trim() || undefined);
                        if (!result.supported) {
                          setActionError("Unsuspend action is not enabled on this backend.");
                          return;
                        }
                        setActionNotice("Tenant unsuspended successfully.");
                        await loadTenant();
                      } catch (err) {
                        setActionError(toTenantDetailErrorMessage(err, "Failed to unsuspend tenant."));
                      } finally {
                        setActionBusy(false);
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                  >
                    Unsuspend tenant
                  </Button>
                </>
              ) : null}
              {actionNotice ? <Alert severity="success">{actionNotice}</Alert> : null}
              {actionError ? <Alert severity="error">{actionError}</Alert> : null}

              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
                    Recent operations
                  </Typography>
                  {tenantSummaryError ? <Alert severity="error" sx={{ mt: 1 }}>{tenantSummaryError}</Alert> : null}
                  {recentJobsError ? (
                    <Alert severity="error" sx={{ mt: 1 }}>{recentJobsError}</Alert>
                  ) : !recentJobsSupported ? (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>Job history not available.</Typography>
                  ) : recentJobs.length ? (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {recentJobs.map((job) => (
                        <Paper key={job.id} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary" }}>{job.type}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{formatTimestamp(job.created_at)}</Typography>
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              Status: {job.status}
                              {!TERMINAL_JOB_STATUSES.has((job.status || "").toLowerCase()) ? " · in progress" : ""}
                            </Typography>
                            <Button
                              variant="outlined"
                              size="small"
                              sx={{ borderRadius: 99, textTransform: "none", py: 0 }}
                              onClick={() => {
                                if (!id) return;
                                router.replace(`/tenants/${id}?job=${job.id}#jobs`);
                              }}
                            >
                              View logs
                            </Button>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>No recent jobs yet.</Typography>
                  )}
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
                    Latest backup
                  </Typography>
                  {tenantSummary?.last_backup ? (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary", display: "block" }}>
                        {formatTimestamp(tenantSummary.last_backup.created_at)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {tenantSummary.last_backup.file_size_bytes ? `${tenantSummary.last_backup.file_size_bytes} bytes` : "Size unknown"}
                      </Typography>
                    </Box>
                  ) : sortedBackups.length ? (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary", display: "block" }}>
                        {formatTimestamp(typeof sortedBackups[0].created_at === "string" ? sortedBackups[0].created_at : null)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {sortedBackups[0].file_size_bytes ? `${sortedBackups[0].file_size_bytes} bytes` : "Size unknown"}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>No backup history yet.</Typography>
                  )}
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
                    Latest invoice
                  </Typography>
                  {tenantSummary?.last_invoice ? (
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary" }}>
                        {formatCurrencyAmount(tenantSummary.last_invoice.amount_due, tenantSummary.last_invoice.currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Status: {tenantSummary.last_invoice.status || "unknown"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(tenantSummary.last_invoice.created_at || undefined)}
                      </Typography>
                      {tenantSummary.last_invoice.hosted_invoice_url ? (
                        <Link
                          href={tenantSummary.last_invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          underline="hover"
                          sx={{ fontSize: "0.72rem", fontWeight: 700 }}
                        >
                          View invoice
                        </Link>
                      ) : null}
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>No invoice data yet.</Typography>
                  )}
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
                    Latest activity
                  </Typography>
                  {tenantSummary?.last_audit ? (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary", display: "block" }}>{tenantSummary.last_audit.action}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {formatTimestamp(tenantSummary.last_audit.created_at)}
                      </Typography>
                    </Box>
                  ) : auditLog.length ? (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary", display: "block" }}>{auditLog[0].action}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{formatTimestamp(auditLog[0].created_at)}</Typography>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>No activity logged yet.</Typography>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </Paper>
        </Box>
      </Paper>

      <TenantSectionLinks tenantId={id} />

      <TenantSubscriptionSection
        subscriptionError={subscriptionError}
        subscriptionSupported={subscriptionSupported}
        subscription={subscription}
        onRefresh={() => {
          void loadSubscription();
        }}
        formatTimestamp={formatTimestamp}
      />

      <Paper id="jobs" variant="outlined" sx={sectionPaperSx}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Realtime job progress
        </Typography>
        {liveJobId ? (
          <>
            {!jobId && activeRecentJob ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Auto-following latest active job: <Box component="span" sx={{ fontWeight: 700 }}>{activeRecentJob.type}</Box> (
                {activeRecentJob.status})
              </Alert>
            ) : null}
            <JobLogPanel jobId={liveJobId} />
          </>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            No active jobs right now. Select a recent operation to open logs.
          </Alert>
        )}
      </Paper>

      <Paper id="backups" variant="outlined" sx={sectionPaperSx}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Recovery backups
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void loadBackups();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>

        {!backupsSupported ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Backup history endpoint is not available on this backend yet.
          </Alert>
        ) : sortedBackups.length ? (
          <>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2, borderRadius: 3 }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "grey.50" }}>
                  <TableRow>
                    <TableCell>Created</TableCell>
                    <TableCell>Backup file</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedBackups.map((entry, index) => {
                    const link = resolveBackupDownload(entry);
                    return (
                      <TableRow key={`${entry.id ?? entry.job_id ?? "backup"}-${index}`}>
                        <TableCell>{formatTimestamp(typeof entry.created_at === "string" ? entry.created_at : null)}</TableCell>
                        <TableCell>
                          {link ? (
                            <Link href={link} target="_blank" rel="noreferrer" underline="hover" sx={{ color: "#0d6a6a" }}>
                              {String(entry.file_path ?? "Download backup")}
                            </Link>
                          ) : (
                            <Typography variant="body2" color="text.disabled">
                              {String(entry.file_path ?? "Unavailable")}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{typeof entry.file_size_bytes === "number" ? `${entry.file_size_bytes} bytes` : "—"}</TableCell>
                        <TableCell>{formatTimestamp(typeof entry.expires_at === "string" ? entry.expires_at : null)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={!entry.id || restoreBusy}
                            onClick={() => {
                              setRestoreTarget(entry);
                              setRestoreConfirm("");
                              setRestoreError(null);
                              setRestoreNotice(null);
                            }}
                            sx={{ borderRadius: 99, textTransform: "none" }}
                          >
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {restoreTarget ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
                  Confirm restore
                </Typography>
                <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
                  Restoring will overwrite the current tenant database with the selected backup. Type{" "}
                  <Box component="span" sx={{ fontWeight: 700 }}>RESTORE</Box> to continue.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
                  <TextField
                    value={restoreConfirm}
                    onChange={(event) => setRestoreConfirm(event.target.value)}
                    placeholder="RESTORE"
                    size="small"
                  />
                  <Button
                    variant="contained"
                    size="small"
                    disabled={restoreConfirm.trim() !== "RESTORE" || restoreBusy || !restoreTarget.id || !tenant}
                    onClick={async () => {
                      if (!tenant || !restoreTarget.id) return;
                      setRestoreBusy(true);
                      setRestoreError(null);
                      setRestoreNotice(null);
                      try {
                        const result = await restoreTenantFromBackup(tenant.id, restoreTarget.id);
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
                        setRestoreError(toTenantDetailErrorMessage(err, "Failed to queue restore"));
                      } finally {
                        setRestoreBusy(false);
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700, bgcolor: "#0d6a6a" }}
                  >
                    {restoreBusy ? "Queuing..." : "Confirm restore"}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setRestoreTarget(null);
                      setRestoreConfirm("");
                    }}
                    sx={{ borderRadius: 99, textTransform: "none" }}
                  >
                    Cancel
                  </Button>
                </Stack>
                {restoreError ? <Alert severity="error" sx={{ mt: 1 }}>{restoreError}</Alert> : null}
                {restoreNotice ? <Alert severity="success" sx={{ mt: 1 }}>{restoreNotice}</Alert> : null}
              </Alert>
            ) : null}
          </>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            No backup records yet. Trigger a backup from dashboard when you need a restore point.
          </Alert>
        )}
      </Paper>

      <Paper id="team" variant="outlined" sx={sectionPaperSx}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Team
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void loadMembers();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>

        {!membersSupported ? (
          <Alert severity="warning">
            Team management is not available on this backend yet.
          </Alert>
        ) : membersError ? (
          <Alert severity="error">{membersError}</Alert>
        ) : (
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Invite teammate</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    placeholder="Email address"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    select
                    size="small"
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                    SelectProps={{ native: true }}
                  >
                    {memberRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </TextField>
                  <Button
                    variant="outlined"
                    color="success"
                    disabled={inviting || !inviteEmail.trim()}
                    onClick={async () => {
                      if (!id) return;
                      setInviting(true);
                      setMembersError(null);
                      try {
                        const result = await inviteTenantMember(id, {
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
                        setMembersError(toTenantDetailErrorMessage(err, "Failed to invite member"));
                      } finally {
                        setInviting(false);
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                  >
                    Invite
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "grey.50" }}>
                  <TableRow>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Joined</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">No team members yet.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>{member.user_email || member.user_id}</TableCell>
                        <TableCell>
                          {member.role === "owner" ? (
                            <Chip label="owner" size="small" variant="outlined" />
                          ) : (
                            <TextField
                              select
                              size="small"
                              value={member.role}
                              onChange={async (event) => {
                                if (!id) return;
                                const nextRole = event.target.value;
                                setUpdatingMemberId(member.id);
                                setMembersError(null);
                                try {
                                  const result = await updateTenantMemberRole(id, member.id, nextRole);
                                  if (!result.supported) {
                                    setMembersError("Member update endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadMembers();
                                } catch (err) {
                                  setMembersError(toTenantDetailErrorMessage(err, "Failed to update member role"));
                                } finally {
                                  setUpdatingMemberId(null);
                                }
                              }}
                              disabled={updatingMemberId === member.id}
                              SelectProps={{ native: true }}
                            >
                              {memberRoles.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </TextField>
                          )}
                        </TableCell>
                        <TableCell>{formatTimestamp(member.created_at)}</TableCell>
                        <TableCell>
                          {member.role === "owner" ? (
                            <Typography variant="caption" color="text.secondary">Owner</Typography>
                          ) : (
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              disabled={removingMemberId === member.id}
                              onClick={async () => {
                                if (!id) return;
                                setRemovingMemberId(member.id);
                                setMembersError(null);
                                try {
                                  const result = await removeTenantMember(id, member.id);
                                  if (!result.supported) {
                                    setMembersError("Member removal endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadMembers();
                                } catch (err) {
                                  setMembersError(toTenantDetailErrorMessage(err, "Failed to remove member"));
                                } finally {
                                  setRemovingMemberId(null);
                                }
                              }}
                              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                            >
                              Remove
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </Paper>

      <Paper id="domains" variant="outlined" sx={sectionPaperSx}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Custom domains
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void loadDomains();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
          Add a branded domain. Point a CNAME record at <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{tenant.domain}</Box>, then verify
          once DNS has propagated.
        </Typography>

        {!domainsSupported ? (
          <Alert severity="warning">
            Custom domain management is not available on this backend yet.
          </Alert>
        ) : domainsError ? (
          <Alert severity="error">{domainsError}</Alert>
        ) : (
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Add custom domain</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    placeholder="e.g. erp.example.com"
                    value={domainInput}
                    onChange={(event) => setDomainInput(event.target.value)}
                    size="small"
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    color="success"
                    disabled={addingDomain || !domainInput.trim()}
                    onClick={async () => {
                      if (!id) return;
                      setAddingDomain(true);
                      setDomainsError(null);
                      try {
                        const result = await createTenantDomain(id, domainInput.trim());
                        if (!result.supported) {
                          setDomainsError("Custom domain endpoint is not available on this backend.");
                          return;
                        }
                        setDomainInput("");
                        await loadDomains();
                      } catch (err) {
                        setDomainsError(toTenantDetailErrorMessage(err, "Failed to add domain"));
                      } finally {
                        setAddingDomain(false);
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                  >
                    {addingDomain ? "Adding..." : "Add domain"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "grey.50" }}>
                  <TableRow>
                    <TableCell>Domain</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Added</TableCell>
                    <TableCell>Verified</TableCell>
                    <TableCell>Token</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {domains.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary">No custom domains added yet.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    domains.map((domain) => (
                      <TableRow key={domain.id}>
                        <TableCell>{domain.domain}</TableCell>
                        <TableCell>
                          <Chip label={domain.status} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>{formatTimestamp(domain.created_at)}</TableCell>
                        <TableCell>{formatTimestamp(domain.verified_at)}</TableCell>
                        <TableCell>{domain.verification_token}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Button
                              variant="outlined"
                              color="success"
                              size="small"
                              disabled={domain.status === "verified" || verifyingDomainId === domain.id}
                              onClick={async () => {
                                if (!id) return;
                                setVerifyingDomainId(domain.id);
                                setDomainsError(null);
                                try {
                                  const result = await verifyTenantDomain(id, domain.id, domain.verification_token);
                                  if (!result.supported) {
                                    setDomainsError("Domain verification endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadDomains();
                                } catch (err) {
                                  setDomainsError(toTenantDetailErrorMessage(err, "Failed to verify domain"));
                                } finally {
                                  setVerifyingDomainId(null);
                                }
                              }}
                              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                            >
                              {verifyingDomainId === domain.id ? "Verifying..." : "Verify"}
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              disabled={removingDomainId === domain.id}
                              onClick={async () => {
                                if (!id) return;
                                setRemovingDomainId(domain.id);
                                setDomainsError(null);
                                try {
                                  const result = await deleteTenantDomain(id, domain.id);
                                  if (!result.supported) {
                                    setDomainsError("Domain removal endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadDomains();
                                } catch (err) {
                                  setDomainsError(toTenantDetailErrorMessage(err, "Failed to remove domain"));
                                } finally {
                                  setRemovingDomainId(null);
                                }
                              }}
                              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                            >
                              {removingDomainId === domain.id ? "Removing..." : "Remove"}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </Paper>

      {isAdmin ? (
        <Paper id="support" variant="outlined" sx={sectionPaperSx}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>Support notes</Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                void loadSupportNotes();
              }}
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
            >
              Refresh
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Filter:</Typography>
            {["all", "open", "monitoring", "resolved", "due_soon", "breached"].map((option) => (
              <Button
                key={option}
                variant={supportNoteFilter === option ? "contained" : "outlined"}
                color={supportNoteFilter === option ? "success" : "inherit"}
                size="small"
                onClick={() => setSupportNoteFilter(option)}
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
              >
                {option.replace("_", " ")}
              </Button>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
            Internal notes are visible to platform admins only. Use them to track incidents, billing context, or key follow-ups.
          </Typography>

          {!supportNotesSupported ? (
            <Alert severity="warning">
              Support notes are not available on this backend yet.
            </Alert>
          ) : supportNotesError ? (
            <Alert severity="error">{supportNotesError}</Alert>
          ) : (
            <Stack spacing={2}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Add support note</Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <TextField
                      select
                      size="small"
                      value={supportNoteCategory}
                      onChange={(event) => setSupportNoteCategory(event.target.value)}
                      SelectProps={{ native: true }}
                    >
                      <option value="note">Note</option>
                      <option value="incident">Incident</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="billing">Billing</option>
                    </TextField>
                    <TextField
                      select
                      size="small"
                      value={supportNoteStatus}
                      onChange={(event) => setSupportNoteStatus(event.target.value)}
                      SelectProps={{ native: true }}
                    >
                      {["open", "monitoring", "resolved"].map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      placeholder="Owner name"
                      value={supportNoteOwner}
                      onChange={(event) => setSupportNoteOwner(event.target.value)}
                    />
                    <TextField
                      size="small"
                      placeholder="Contact (phone/WhatsApp/email)"
                      value={supportNoteContact}
                      onChange={(event) => setSupportNoteContact(event.target.value)}
                    />
                    <TextField
                      size="small"
                      type="datetime-local"
                      value={supportNoteDueAt}
                      onChange={(event) => setSupportNoteDueAt(event.target.value)}
                    />
                    <Button
                      variant="outlined"
                      color="success"
                      disabled={savingSupportNote || !supportNoteText.trim()}
                      onClick={async () => {
                        if (!id) return;
                        setSavingSupportNote(true);
                        setSupportNotesError(null);
                        try {
                          const result = await createTenantSupportNote(
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
                          setSupportNotesError(toTenantDetailErrorMessage(err, "Failed to save note"));
                        } finally {
                          setSavingSupportNote(false);
                        }
                      }}
                      sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                    >
                      {savingSupportNote ? "Saving..." : "Save note"}
                    </Button>
                    </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="caption" color="text.secondary">Filter notes:</Typography>
                    {["all", "open", "monitoring", "resolved", "due_soon", "breached"].map((option) => (
                      <Button
                        key={option}
                        variant={supportNoteFilter === option ? "contained" : "outlined"}
                        color={supportNoteFilter === option ? "success" : "inherit"}
                        size="small"
                        onClick={() => setSupportNoteFilter(option)}
                        sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                      >
                        {option.replace("_", " ")}
                      </Button>
                    ))}
                  </Stack>
                  <TextField
                    multiline
                    minRows={4}
                    fullWidth
                    placeholder="Record the support context, decisions, and next steps."
                    value={supportNoteText}
                    onChange={(event) => setSupportNoteText(event.target.value)}
                  />
                  </Stack>
                </CardContent>
              </Card>

              <Stack spacing={1.5}>
                {supportNotes.length === 0 ? (
                  <Alert severity="info">
                    No support notes yet.
                  </Alert>
                ) : (
                  filteredSupportNotes.map((note) => (
                    <Card key={note.id} variant="outlined" sx={{ borderRadius: 3 }}>
                      <CardContent sx={{ p: 2 }}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} justifyContent="space-between">
                        <Chip label={note.category} size="small" variant="outlined" />
                        <Typography variant="caption" color="text.secondary">{formatTimestamp(note.created_at)}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">Status: {note.status ?? "open"}</Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            `SLA: ${getSlaState(note).replace("_", " ")}`
                          }
                        />
                      </Stack>
                      <Typography variant="body2" sx={{ mt: 1.5, color: "text.primary" }}>{note.note}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                        Owner: {note.owner_name || "—"} {note.owner_contact ? `• ${note.owner_contact}` : ""}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        SLA due: {note.sla_due_at ? formatTimestamp(note.sla_due_at) : "—"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                        {note.author_email || note.author_role || "admin"} • {note.author_role}
                      </Typography>
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={savingSupportNote}
                          onClick={async () => {
                            if (!note.id) return;
                            setSavingSupportNote(true);
                            try {
                              const result = await updateTenantSupportNote(note.id, {
                                status: note.status === "resolved" ? "open" : "resolved",
                              });
                              if (!result.supported) {
                                setSupportNotesSupported(false);
                                return;
                              }
                              await loadSupportNotes();
                            } catch (err) {
                              setSupportNotesError(toTenantDetailErrorMessage(err, "Failed to update support note"));
                            } finally {
                              setSavingSupportNote(false);
                            }
                          }}
                          sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                        >
                          {note.status === "resolved" ? "Reopen" : "Mark resolved"}
                        </Button>
                      </Stack>
                      </CardContent>
                    </Card>
                  ))
                )}
              </Stack>
            </Stack>
          )}
        </Paper>
      ) : null}

      <TenantActivitySection
        auditSupported={auditSupported}
        auditError={auditError}
        auditLog={auditLog}
        auditPage={auditPage}
        auditTotalPages={auditTotalPages}
        auditTotal={auditTotal}
        onRefresh={() => {
          void loadAuditLog();
        }}
        onPreviousPage={() => setAuditPage((prev) => Math.max(1, prev - 1))}
        onNextPage={() => setAuditPage((prev) => Math.min(auditTotalPages, prev + 1))}
        canGoPrevious={auditPage > 1}
        canGoNext={auditPage < auditTotalPages}
        formatTimestamp={formatTimestamp}
      />

      {error ? <Alert severity="error">{error}</Alert> : null}
    </Box>
  );
}
