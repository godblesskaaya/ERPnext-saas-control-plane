"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";

import { TenantCreateForm } from "./TenantCreateForm";
import { TenantTable } from "./TenantTable";
import { useNotifications } from "../../shared/components/NotificationsProvider";
import { ErrorState, LoadingState, PageHeader } from "../../shell/components";
import type { Job, Tenant, TenantCreateResponse, UserProfile } from "../../shared/lib/types";
import {
  deriveWorkspaceQueueSnapshot,
  isWorkspaceQueueSessionExpired,
  loadWorkspaceCurrentUserProfile,
  loadWorkspaceBillingPortal,
  loadWorkspaceQueue,
  onWorkspaceSessionExpired,
  queueWorkspaceBackup,
  queueWorkspaceTenantDelete,
  resendWorkspaceVerificationEmail,
  resetWorkspaceTenantAdminPassword,
  retryWorkspaceProvisioning,
  toWorkspaceQueueErrorMessage,
  updateWorkspaceTenantPlan,
} from "../../tenant-ops/application/workspaceQueueUseCases";

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "deleted", "canceled", "cancelled"]);

type QueueConfig = {
  title: string;
  description: string;
  routeScope?: "workspace" | "admin";
  statusFilter?: string[];
  billingFilter?: string[];
  billingFilterMode?: "and" | "or";
  paymentChannelFilter?: string[];
  handoffLinks?: { label: string; href: string }[];
  callout?: { title: string; body: string; tone?: "default" | "warn" };
  extraContent?: ReactNode;
  showCreate?: boolean;
  showMetrics?: boolean;
  showAttention?: boolean;
  showActionCenter?: boolean;
  showBillingAlert?: boolean;
  showStatusFilter?: boolean;
  attentionNote?: string;
  emptyStateTitle?: string;
  emptyStateBody?: string;
  emptyStateActionLabel?: string;
  emptyStateActionHref?: string;
};

type ActionCenterCard = {
  href: string;
  eyebrow: string;
  value: number;
  description: string;
  cardBgColor?: string;
  valueColor?: string;
};

function metricCard(label: string, value: number, hint: string, tone: "default" | "good" | "warn" = "default") {
  const toneSx =
    tone === "good"
      ? { borderColor: "#a7f3d0", bgcolor: "#ecfdf5", color: "#065f46" }
      : tone === "warn"
      ? { borderColor: "#fcd34d", bgcolor: "#fffbeb", color: "#92400e" }
      : { borderColor: "divider", bgcolor: "background.paper", color: "text.primary" };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, ...toneSx }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.7, opacity: 0.85 }}>
          {label}
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
          {value}
        </Typography>
        <Typography variant="caption" sx={{ mt: 0.5, display: "block", opacity: 0.85 }}>
          {hint}
        </Typography>
      </CardContent>
    </Card>
  );
}

export function WorkspaceQueuePage({
  title,
  description,
  routeScope = "workspace",
  statusFilter,
  billingFilter,
  billingFilterMode = "and",
  paymentChannelFilter,
  handoffLinks,
  callout,
  extraContent,
  showCreate = false,
  showMetrics = true,
  showAttention = false,
  showActionCenter = false,
  showBillingAlert = false,
  showStatusFilter = true,
  attentionNote,
  emptyStateTitle,
  emptyStateBody,
  emptyStateActionLabel,
  emptyStateActionHref,
}: QueueConfig) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [metricsTenants, setMetricsTenants] = useState<Tenant[]>([]);
  const [jobsByTenant, setJobsByTenant] = useState<Record<string, Job | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [retryingTenantId, setRetryingTenantId] = useState<string | null>(null);
  const [statusFilterValue, setStatusFilterValue] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [billingPortalUrl, setBillingPortalUrl] = useState<string | null>(null);
  const [billingPortalError, setBillingPortalError] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  const [updatingTenantId, setUpdatingTenantId] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (isWorkspaceQueueSessionExpired(err)) {
        setError("Session expired. Please log in again.");
        router.push("/login?reason=session-expired");
        return;
      }
      setError(toWorkspaceQueueErrorMessage(err, fallback));
    },
    [router]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await loadWorkspaceQueue({
        page,
        limit,
        showStatusFilter,
        statusFilter,
        statusFilterValue,
        search,
        planFilter,
        billingFilter,
        paymentChannelFilter,
        billingFilterMode,
      });
      setTenants(queue.visibleTenants);
      setMetricsTenants(queue.metricsTenants);
      setTotal(queue.total);
      if (queue.page !== page) {
        setPage(queue.page);
      }
      setError(null);
      setLastUpdated(new Date());
      setJobsByTenant((previous) => {
        const activeTenantIds = new Set(queue.visibleTenants.map((tenant) => tenant.id));
        const next: Record<string, Job | undefined> = {};
        for (const [tenantId, job] of Object.entries(previous)) {
          if (activeTenantIds.has(tenantId)) {
            next[tenantId] = job;
          }
        }
        return next;
      });
    } catch (err) {
      handleError(err, "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, [
    billingFilter,
    billingFilterMode,
    handleError,
    limit,
    page,
    paymentChannelFilter,
    planFilter,
    search,
    showStatusFilter,
    statusFilter,
    statusFilterValue,
  ]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await loadWorkspaceCurrentUserProfile();
      setCurrentUser(user);
      if (user.email_verified) {
        setVerificationNotice(null);
      }
    } catch (err) {
      handleError(err, "Failed to load profile");
    }
  }, [handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    setPage(1);
  }, [billingFilter, billingFilterMode, paymentChannelFilter, planFilter, search, statusFilter, statusFilterValue]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!showStatusFilter && statusFilter && statusFilter.length === 1) {
      setStatusFilterValue(statusFilter[0]);
    }
  }, [showStatusFilter, statusFilter]);

  useEffect(() => {
    if (searchParams.get("verifyEmail") === "1") {
      setVerificationNotice("Please verify your email to unlock tenant creation.");
    }
  }, [searchParams]);

  useEffect(() => {
    return onWorkspaceSessionExpired(() => {
      setError("Session expired. Please log in again.");
      router.push("/login?reason=session-expired");
    });
  }, [router]);

  const activeJobs = useMemo(
    () => Object.values(jobsByTenant).filter((job): job is Job => Boolean(job)).length,
    [jobsByTenant]
  );

  const queueSnapshot = useMemo(() => deriveWorkspaceQueueSnapshot(metricsTenants, activeJobs), [activeJobs, metricsTenants]);
  const {
    totalTenants,
    activeTenants,
    pendingPaymentTenants,
    provisioningQueueTenants,
    provisioningTenants,
    failedTenants,
    billingQueueCount,
    suspendedTenants,
    needsAttentionCount,
  } = queueSnapshot;
  const pagedTenants = tenants;
  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleString() : "Not refreshed yet";
  const attentionSummary =
    attentionNote ??
    (needsAttentionCount === 0
      ? "All clear. No provisioning blockers right now."
      : `${needsAttentionCount} item(s) need attention in your queue.`);
  const isAdminScope = routeScope === "admin";
  const rootCrumb = isAdminScope
    ? { label: "Admin", href: "/app/admin/control-overview" }
    : { label: "Dashboard", href: "/app/overview" };
  const headerCrumbs = [rootCrumb, { label: title }];
  const billingFollowUpHref = isAdminScope ? "/app/admin/billing-ops" : "/app/billing/invoices";
  const billingFollowUpLabel = isAdminScope ? "Go to billing follow-ups" : "Open payment center";
  const statusOptions = isAdminScope
    ? [
        ["all", "All statuses"],
        ["active", "Active"],
        ["pending_payment", "Pending payment"],
        ["pending", "Pending"],
        ["provisioning", "Provisioning"],
        ["failed", "Failed"],
        ["suspended", "Suspended (all)"],
        ["suspended_admin", "Suspended (admin)"],
        ["suspended_billing", "Suspended (billing)"],
        ["upgrading", "Upgrading"],
        ["restoring", "Restoring"],
        ["pending_deletion", "Pending deletion"],
      ]
    : [
        ["all", "All statuses"],
        ["active", "Active"],
        ["pending_payment", "Pending payment"],
        ["pending", "Pending"],
        ["provisioning", "Provisioning"],
        ["failed", "Failed"],
        ["suspended", "Suspended"],
        ["upgrading", "Upgrading"],
        ["restoring", "Restoring"],
      ];

  const actionCenterCards = useMemo<ActionCenterCard[]>(() => {
    if (isAdminScope) {
      return [
        {
          href: "/app/platform/onboarding",
          eyebrow: "Payment confirmation",
          value: pendingPaymentTenants,
          description: "Sign-ups waiting for payment confirmation.",
          valueColor: "warning.dark",
          cardBgColor: "#fff7ed",
        },
        {
          href: "/app/platform/provisioning",
          eyebrow: "Provisioning queue",
          value: provisioningQueueTenants,
          description: "Deployments and upgrades still in progress.",
        },
        {
          href: "/app/platform/incidents",
          eyebrow: "System failures",
          value: failedTenants,
          description: "Provisioning failures needing operator action.",
          valueColor: "error.main",
        },
        {
          href: "/app/tenants/suspensions",
          eyebrow: "Account suspensions",
          value: suspendedTenants,
          description: "Admin or billing suspensions to review.",
        },
        {
          href: "/app/admin/billing-ops",
          eyebrow: "Billing follow-ups",
          value: billingQueueCount,
          description: "Pending payments and failed billing workspaces.",
          cardBgColor: "#f7fbf9",
        },
      ];
    }

    return [
      {
        href: "/app/billing/invoices",
        eyebrow: "Payments",
        value: pendingPaymentTenants,
        description: "Resume checkout and review unpaid invoices.",
        valueColor: "warning.dark",
        cardBgColor: "#fff7ed",
      },
      {
        href: "/app/tenants",
        eyebrow: "Workspace registry",
        value: totalTenants,
        description: "Search all workspaces and open workspace details.",
      },
      {
        href: "/app/tenants/active",
        eyebrow: "Active workspaces",
        value: activeTenants,
        description: "Monitor live customers and continue routine actions.",
      },
      {
        href: "/app/platform/onboarding",
        eyebrow: "Onboarding",
        value: provisioningTenants,
        description: "Track setup progress for newly created workspaces.",
      },
    ];
  }, [
    activeTenants,
    billingQueueCount,
    failedTenants,
    isAdminScope,
    pendingPaymentTenants,
    provisioningQueueTenants,
    provisioningTenants,
    suspendedTenants,
    totalTenants,
  ]);
  const visibleHandoffLinks = useMemo(() => {
    if (!handoffLinks || handoffLinks.length === 0) {
      return [];
    }
    if (isAdminScope) {
      return handoffLinks;
    }
    return handoffLinks.filter((link) => !link.href.startsWith("/admin"));
  }, [handoffLinks, isAdminScope]);
  const showRouteLoading = loading && tenants.length === 0 && !error;
  const showRouteError = Boolean(error) && tenants.length === 0;

  const setTenantJob = (tenantId: string, job: Job) => {
    setJobsByTenant((previous) => ({ ...previous, [tenantId]: job }));
  };

  const resendVerification = async () => {
    setResendBusy(true);
    try {
      const result = await resendWorkspaceVerificationEmail();
      setVerificationNotice(result.message || "Verification email sent. Check your inbox.");
    } catch (err) {
      setVerificationNotice(toWorkspaceQueueErrorMessage(err, "Failed to resend verification email."));
    } finally {
      setResendBusy(false);
    }
  };

  const retryProvisioning = async (tenantId: string) => {
    setRetryingTenantId(tenantId);
    try {
      const result = await retryWorkspaceProvisioning(tenantId);
      if (!result.supported) {
        setError("Retry endpoint is not available on this backend.");
        return;
      }
      setTenantJob(tenantId, result.data);
      addNotification({
        type: "success",
        title: "Provisioning retried",
        body: "A new provisioning job has been queued.",
      });
      await load();
    } catch (err) {
      setError(toWorkspaceQueueErrorMessage(err, "Failed to retry provisioning."));
    } finally {
      setRetryingTenantId(null);
    }
  };

  const updateTenantPlan = async (tenantId: string, payload: { plan: string; chosen_app?: string }) => {
    setUpdatingTenantId(tenantId);
    try {
      const result = await updateWorkspaceTenantPlan(tenantId, payload);
      if (!result.supported) {
        setError("Plan update is not available on this backend.");
        return;
      }
      setTenants((prev) => prev.map((tenant) => (tenant.id === tenantId ? result.data : tenant)));
      setMetricsTenants((prev) => prev.map((tenant) => (tenant.id === tenantId ? result.data : tenant)));
      addNotification({
        type: "success",
        title: "Plan updated",
        body: `Workspace ${result.data.domain} is now on ${result.data.plan}.`,
      });
    } catch (err) {
      setError(toWorkspaceQueueErrorMessage(err, "Failed to update plan."));
    } finally {
      setUpdatingTenantId(null);
    }
  };

  const canCreateTenants = !currentUser || currentUser.email_verified;

  const loadBillingPortal = async () => {
    setBillingPortalError(null);
    try {
      const result = await loadWorkspaceBillingPortal();
      if (!result.supported) {
        setBillingPortalError("Billing portal is not available on this backend.");
        return;
      }
      setBillingPortalUrl(result.data.url);
      addNotification({
        type: "info",
        title: "Billing workspace ready",
        body: "A billing workspace link is ready to open in a new tab.",
      });
    } catch (err) {
      setBillingPortalError(toWorkspaceQueueErrorMessage(err, "Unable to open billing portal."));
    }
  };

  return (
    <Stack spacing={4}>
      <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "divider", bgcolor: "background.paper" }}>
        <CardContent sx={{ p: 3 }}>
          <PageHeader
            overline={isAdminScope ? "Operations" : "Workspace"}
            title={title}
            subtitle={description}
            breadcrumbs={headerCrumbs}
            actions={
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {showCreate ? (
                  <Button component="a" href="#create-tenant" variant="contained" size="small" sx={{ borderRadius: 1.5 }}>
                    New workspace
                  </Button>
                ) : null}
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ borderRadius: 1.5 }}
                  onClick={() => {
                    void load();
                  }}
                  disabled={loading}
                >
                  {loading ? "Refreshing..." : "Refresh data"}
                </Button>
              </Stack>
            }
          />
        </CardContent>
      </Card>

      {showAttention ? (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1.2fr 1fr" } }}>
          <Card variant="outlined" sx={{ borderRadius: 4, borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(255,255,255,0.88)" }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Attention queue
                </Typography>
                <Chip
                  size="small"
                  color={needsAttentionCount ? "warning" : "success"}
                  label={needsAttentionCount ? `${needsAttentionCount} item(s) need review` : "No blockers right now"}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                {attentionSummary}
              </Typography>
              <Box sx={{ mt: 2, display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
                <Box sx={{ border: "1px solid", borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(37,99,235,0.06)", borderRadius: 2, px: 1.5, py: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Failed workspaces: <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>{failedTenants}</Box>
                  </Typography>
                </Box>
                <Box sx={{ border: "1px solid", borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(37,99,235,0.06)", borderRadius: 2, px: 1.5, py: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Provisioning queue: <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>{provisioningTenants}</Box>
                  </Typography>
                </Box>
                <Box sx={{ border: "1px solid", borderColor: "rgba(245,158,11,0.35)", bgcolor: "#f7fbf9", borderRadius: 2, px: 1.5, py: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Live jobs: <Box component="span" sx={{ fontWeight: 700, color: "primary.main" }}>{activeJobs}</Box>
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 4, borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(255,255,255,0.88)" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {isAdminScope ? "Ops pulse" : "Workspace pulse"}
              </Typography>
              <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                <Box sx={{ border: "1px solid", borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(37,99,235,0.05)", borderRadius: 2, p: 1.5 }}>
                  <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }} color="text.secondary">
                    Last refresh
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {lastUpdatedLabel}
                  </Typography>
                </Box>
                <Box sx={{ border: "1px solid", borderColor: "rgba(245,158,11,0.35)", bgcolor: "background.paper", borderRadius: 2, p: 1.5 }}>
                  <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }} color="text.secondary">
                    Coverage note
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                  {isAdminScope
                    ? "Designed for branch teams running on laptop + phone across Tanzania."
                    : "Designed for customer teams running sales, finance, and stock workflows across Tanzania."}
                  </Typography>
                </Box>
                <Box sx={{ border: "1px solid", borderColor: "rgba(245,158,11,0.35)", bgcolor: "#f7fbf9", borderRadius: 2, p: 1.5 }}>
                  <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }} color="text.secondary">
                    Next best action
                  </Typography>
                  <Typography variant="body2" color="text.primary">
                  {needsAttentionCount > 0
                    ? isAdminScope
                      ? "Review failed or provisioning workspaces first."
                      : "Review pending payments and setup blockers first."
                    : "Audit active tenants or queue new workspaces."}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      ) : null}

      {currentUser && !currentUser.email_verified ? (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ borderRadius: 4, borderColor: "rgba(245,158,11,0.4)", bgcolor: "#fffbeb", px: 2, py: 1.5 }}
        >
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: "center" }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "primary.main" }}>
                  Email verification required
                </Typography>
                <Typography variant="caption" sx={{ color: "primary.main" }}>
                  Verify {currentUser.email} before creating a workspace. Check your inbox for the verification link.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="warning"
                size="small"
                sx={{ borderRadius: 999, alignSelf: { xs: "flex-start", sm: "auto" } }}
                disabled={resendBusy}
                onClick={() => {
                  void resendVerification();
                }}
              >
                {resendBusy ? "Sending..." : "Resend verification"}
              </Button>
            </Stack>
            {verificationNotice ? (
              <Typography variant="caption" sx={{ color: "primary.main" }}>
                {verificationNotice}
              </Typography>
            ) : null}
          </Stack>
        </Alert>
      ) : null}

      {showMetrics ? (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" } }}>
          {metricCard("Total workspaces", totalTenants, "All customer environments under management")}
          {metricCard("Healthy", activeTenants, "Ready for daily sales, stock, and finance activity", "good")}
          {metricCard("In setup", provisioningTenants, "Still being provisioned or awaiting payment checks", "warn")}
          {metricCard(
            "Needs follow-up",
            failedTenants,
            isAdminScope ? "Provisioning failed and requires operator action" : "Provisioning failed and needs support follow-up",
            failedTenants > 0 ? "warn" : "default",
          )}
        </Box>
      ) : null}

      {showActionCenter ? (
        <Card variant="outlined" sx={{ borderRadius: 4, borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(255,255,255,0.88)" }}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1} alignItems={{ md: "center" }}>
              <Box>
                <Typography variant="overline" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: 0.7 }}>
                  Action center
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {isAdminScope ? "Queues that need attention" : "Workspace priorities"}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {isAdminScope ? "Inspired by AWS Health dashboards" : "Journey-first workspace routing"}
              </Typography>
            </Stack>
            <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
              {actionCenterCards.map((card) => (
                <Box key={card.href} component={Link} href={card.href} sx={{ textDecoration: "none" }}>
                  <Card
                    variant="outlined"
                    sx={{ borderRadius: 3, borderColor: "rgba(245,158,11,0.35)", p: 2, bgcolor: card.cardBgColor ?? "background.paper" }}
                  >
                    <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.6 }} color="text.secondary">
                      {card.eyebrow}
                    </Typography>
                    <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700, color: card.valueColor ?? "text.primary" }}>
                      {card.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {card.description}
                    </Typography>
                  </Card>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      ) : null}

      {visibleHandoffLinks.length > 0 ? (
        <Card variant="outlined" sx={{ borderRadius: 4, borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(255,255,255,0.88)" }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1} alignItems={{ md: "center" }}>
              <Typography variant="overline" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: 0.7 }}>
                Queue handoff
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {visibleHandoffLinks.map((link) => (
                  <Button
                    key={link.href}
                    component={Link}
                    href={link.href}
                    variant="outlined"
                    color="warning"
                    size="small"
                    sx={{ borderRadius: 999 }}
                  >
                    {link.label}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {callout ? (
        <Alert
          severity={callout.tone === "warn" ? "warning" : "info"}
          variant="outlined"
          sx={{
            borderRadius: 4,
            borderColor: "rgba(245,158,11,0.35)",
            bgcolor: callout.tone === "warn" ? "#fffbeb" : "rgba(255,255,255,0.88)",
          }}
        >
          <Typography variant="subtitle2">{callout.title}</Typography>
          <Typography variant="body2" sx={{ mt: 0.75 }}>
            {callout.body}
          </Typography>
        </Alert>
      ) : null}

      {showBillingAlert && billingQueueCount > 0 ? (
        <Alert severity="error" variant="outlined" sx={{ borderRadius: 4 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Billing follow-up needed
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {billingQueueCount} workspace(s) need payment attention (pending, suspended, or unpaid). Direct them to
            settle invoices so provisioning and upgrades can resume.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
            <Button component={Link} href={billingFollowUpHref} variant="outlined" color="error" size="small" sx={{ borderRadius: 999 }}>
              {billingFollowUpLabel}
            </Button>
            <Button variant="outlined" color="error" size="small" sx={{ borderRadius: 999 }} onClick={() => void loadBillingPortal()}>
              Open ERPNext billing workspace
            </Button>
            {billingPortalUrl ? (
              <Button component="a" href={billingPortalUrl} target="_blank" rel="noreferrer" variant="contained" color="error" size="small" sx={{ borderRadius: 999 }}>
                Continue in ERPNext
              </Button>
            ) : null}
          </Stack>
          {billingPortalError ? <Typography variant="caption" color="error" sx={{ mt: 1, display: "block" }}>{billingPortalError}</Typography> : null}
        </Alert>
      ) : null}

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" } }}>
        <Card variant="outlined" sx={{ borderRadius: 4, borderColor: "rgba(245,158,11,0.35)", bgcolor: "rgba(255,255,255,0.88)" }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: 0.7 }}>
              Filter workspaces
            </Typography>
            <Box sx={{ mt: 1.5, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
              <TextField
                size="small"
                placeholder="Search by company, subdomain, or domain"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <TextField size="small" select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
                <MenuItem value="all">All plans</MenuItem>
                <MenuItem value="starter">Starter</MenuItem>
                <MenuItem value="business">Business</MenuItem>
                <MenuItem value="enterprise">Enterprise</MenuItem>
              </TextField>
              {showStatusFilter ? (
                <TextField size="small" select value={statusFilterValue} onChange={(event) => setStatusFilterValue(event.target.value)}>
                  {statusOptions.map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: 1.5, py: 1.25 }}>
                  <Typography variant="body2" color="text.secondary">
                    {statusFilter?.length
                      ? `Queue: ${statusFilter.map((status) => status.replace("_", " ")).join(", ")}`
                      : "All statuses"}
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
        <Box />
      </Box>

      {showCreate ? (
        <TenantCreateForm
          onCreated={async (result: TenantCreateResponse) => {
            if (result.job) {
              setTenantJob(result.tenant.id, result.job);
            }
            addNotification({
              type: "success",
              title: "Workspace requested",
              body: `Workspace ${result.tenant.domain} is queued for setup.`,
            });
            await load();
          }}
          canCreate={canCreateTenants}
          verificationNotice={verificationNotice}
          onResendVerification={resendVerification}
        />
      ) : null}

      {error && !showRouteError ? (
        <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
          {error}
        </Alert>
      ) : null}

      {extraContent}

      {showRouteLoading ? <LoadingState label="Loading workspace queue…" /> : null}

      {showRouteError ? (
        <ErrorState
          message={error ?? "Failed to load workspace queue."}
          action={
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => {
                void load();
              }}
            >
              Retry
            </Button>
          }
        />
      ) : null}

      {!showRouteLoading && !showRouteError ? (
        <TenantTable
          routeScope={routeScope}
          tenants={pagedTenants}
          jobsByTenant={jobsByTenant}
          showPaymentChannel={Boolean(paymentChannelFilter && paymentChannelFilter.length)}
          filterLabel={
            paymentChannelFilter && paymentChannelFilter.length
              ? `Payment channel filter: ${paymentChannelFilter.join(", ").replace(/_/g, " ")}`
              : undefined
          }
          onBackup={async (id) => {
            try {
              const job = await queueWorkspaceBackup(id);
              setTenantJob(id, job);
              setError(null);
              addNotification({
                type: "info",
                title: "Backup started",
                body: "A backup job was queued for this workspace.",
              });
              await load();
            } catch (err) {
              handleError(err, "Failed to trigger backup");
              throw err;
            }
          }}
          onResetAdminPassword={async (id, newPassword) => {
            try {
              const result = await resetWorkspaceTenantAdminPassword(id, newPassword);
              setError(null);
              addNotification({
                type: "warning",
                title: isAdminScope ? "Admin password reset" : "Workspace password reset",
                body: `Credentials reset for ${result.domain}. Share securely with ${isAdminScope ? "the owner" : "your workspace owner"}.`,
              });
              return result;
            } catch (err) {
              handleError(err, isAdminScope ? "Failed to reset admin password" : "Failed to reset workspace password");
              throw err;
            }
          }}
          onDelete={async (id) => {
            try {
              const job = await queueWorkspaceTenantDelete(id);
              setTenantJob(id, job);
              setError(null);
              addNotification({
                type: "warning",
                title: "Workspace deletion queued",
                body: "Deletion has been scheduled. Monitor job logs for completion.",
              });
              await load();
            } catch (err) {
              handleError(err, "Failed to delete tenant");
              throw err;
            }
          }}
          onJobUpdate={(job) => {
            setTenantJob(job.tenant_id, job);
            if (TERMINAL_JOB_STATUSES.has(job.status.toLowerCase())) {
              void load();
            }
          }}
          onRetryProvisioning={retryProvisioning}
          retryingTenantId={retryingTenantId}
          onUpdatePlan={updateTenantPlan}
          updatingTenantId={updatingTenantId}
          emptyStateTitle={emptyStateTitle}
          emptyStateBody={emptyStateBody}
          emptyStateActionLabel={emptyStateActionLabel}
          emptyStateActionHref={emptyStateActionHref}
        />
      ) : null}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
      >
        <Typography variant="caption" color="text.secondary">
          Page {page} of {totalPages} • {total} workspaces
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            sx={{ borderRadius: 999 }}
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            sx={{ borderRadius: 999 }}
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
