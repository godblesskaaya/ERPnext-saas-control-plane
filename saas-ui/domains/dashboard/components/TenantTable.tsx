"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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

import type { Job, ResetAdminPasswordResult, Tenant } from "../../shared/lib/types";
import { JobLogPanel } from "../../shared/components/JobLogPanel";
import { EmptyState } from "../../shell/components";
import { BUSINESS_APP_OPTIONS, getPlanMeta } from "../../onboarding/components/PlanSelector";
import { isTenantBillingBlockedFromOperations } from "../domain/tenantBillingGate";

type Props = {
  routeScope?: "workspace" | "admin";
  tenants: Tenant[];
  jobsByTenant: Record<string, Job | undefined>;
  onResumeCheckout?: (id: string) => Promise<void>;
  resumingCheckoutTenantId?: string | null;
  paymentCenterHref?: string;
  paymentCenterLabel?: string;
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

function statusChipStyles(status: string): { color: "default" | "error" | "success" | "warning"; sx?: Record<string, string> } {
  const normalized = status.toLowerCase();
  if (normalized === "active") return { color: "success" };
  if (["provisioning", "pending", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized)) {
    return { color: "warning" };
  }
  if (normalized === "failed") return { color: "error" };
  if (normalized === "deleted") return { color: "default" };
  if (["suspended", "suspended_admin", "suspended_billing"].includes(normalized)) {
    return { color: "warning", sx: { bgcolor: "#ffedd5", color: "#9a3412" } };
  }
  return { color: "default", sx: { bgcolor: "#e0f2fe", color: "#0369a1" } };
}

function statusHint(status: string, isAdminScope: boolean): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return isAdminScope ? "Serving daily operations" : "Serving daily workspace activity";
  if (normalized === "pending_payment") return "Waiting for checkout confirmation";
  if (normalized === "pending" || normalized === "provisioning") return "Setup in progress";
  if (normalized === "upgrading") return "Upgrade running";
  if (normalized === "restoring") return "Restore in progress";
  if (normalized === "pending_deletion") return "Deletion scheduled";
  if (normalized === "failed") return isAdminScope ? "Needs operator follow-up" : "Needs support follow-up";
  if (normalized === "suspended_admin") return isAdminScope ? "Paused by admin" : "Access paused";
  if (normalized === "suspended_billing") return "Paused for billing";
  if (normalized === "suspended") return "Access paused";
  if (normalized === "deleted") return "Archived";
  return "Status under review";
}

function rowTone(status: string): string | undefined {
  const normalized = status.toLowerCase();
  if (normalized === "failed") return "rgba(254, 242, 242, 1)";
  if (["pending", "pending_payment", "provisioning", "upgrading", "restoring", "pending_deletion"].includes(normalized)) {
    return "rgba(255, 251, 235, 0.65)";
  }
  return undefined;
}

function planChipStyle(plan: string): Record<string, string> {
  const normalized = plan.toLowerCase();
  if (normalized === "enterprise") return { bgcolor: "#e2e8f0", color: "#334155" };
  if (normalized === "business") return { bgcolor: "rgba(13,106,106,0.15)", color: "primary.main" };
  return { bgcolor: "#fef3c7", color: "#92400e" };
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

const PAYMENT_ACTION_STATUSES = new Set(["pending", "pending_payment", "suspended_billing"]);

function canResumeCheckout(status: string): boolean {
  return ["pending", "pending_payment"].includes(status.toLowerCase());
}

export function TenantTable({
  routeScope = "workspace",
  tenants,
  jobsByTenant,
  onResumeCheckout,
  resumingCheckoutTenantId,
  paymentCenterHref = "/app/billing/invoices",
  paymentCenterLabel = "Open payment center",
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
  const isAdminScope = routeScope === "admin";
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

  const renderPaymentActions = (tenant: Tenant) => {
    const normalizedStatus = tenant.status.toLowerCase();
    if (!PAYMENT_ACTION_STATUSES.has(normalizedStatus)) {
      return null;
    }

    return (
      <>
        {canResumeCheckout(normalizedStatus) && onResumeCheckout ? (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            sx={{ borderRadius: 999 }}
            disabled={resumingCheckoutTenantId === tenant.id}
            onClick={() => {
              void onResumeCheckout(tenant.id);
            }}
          >
            {resumingCheckoutTenantId === tenant.id ? "Opening checkout..." : "Resume checkout"}
          </Button>
        ) : null}
        <Button component={Link} href={paymentCenterHref} size="small" variant="outlined" sx={{ borderRadius: 999 }}>
          {paymentCenterLabel}
        </Button>
        <Button component={Link} href={`/app/tenants/${tenant.id}/billing`} size="small" variant="outlined" sx={{ borderRadius: 999 }}>
          Open tenant billing
        </Button>
      </>
    );
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
      <EmptyState
        title={title}
        description={body}
        action={
          actionHref ? (
            <Button
              component="a"
              href={actionHref}
              variant="contained"
              sx={{ borderRadius: 999, bgcolor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }}
            >
              {actionLabel}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {filterLabel ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          {filterLabel}
        </Alert>
      ) : null}

      {showPaymentChannel ? (
        <Card variant="outlined">
          <CardContent sx={{ py: "10px !important" }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {Object.entries(channelCounts).map(([channel, count]) => (
                <Chip key={channel} size="small" variant="outlined" label={`${channel.replace(/_/g, " ")}: ${count}`} />
              ))}
            </Box>
          </CardContent>
        </Card>
      ) : null}

      {passwordResult ? (
        <Alert
          severity="success"
          sx={{
            alignItems: "flex-start",
            "& .MuiAlert-message": { width: "100%" },
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Administrator password reset complete
          </Typography>
          <Typography variant="body2">Tenant: {passwordResult.domain}</Typography>
          <Typography variant="body2">User: {passwordResult.administrator_user}</Typography>
          <Box sx={{ mt: 1, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <Chip label={passwordResult.admin_password} size="small" sx={{ fontFamily: "monospace" }} />
            <Button
              size="small"
              variant="outlined"
              color="success"
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
            </Button>
            {copyState === "copied" ? <Typography variant="caption">Copied</Typography> : null}
            {copyState === "error" ? (
              <Typography variant="caption" color="error">
                Copy failed
              </Typography>
            ) : null}
          </Box>
          <Typography variant="caption" sx={{ mt: 0.5, display: "block" }}>
            Auto-dismisses in {remainingSeconds}s.
          </Typography>
        </Alert>
      ) : null}

      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
        <Card variant="outlined" sx={{ bgcolor: "#ecfdf5", borderColor: "#86efac" }}>
          <CardContent sx={{ py: "10px !important" }}>
            <Typography variant="body2" color="#065f46">
              Live environments: <Box component="span" sx={{ fontWeight: 700 }}>{liveCount}</Box>
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ bgcolor: "#fffbeb", borderColor: "#fcd34d" }}>
          <CardContent sx={{ py: "10px !important" }}>
            <Typography variant="body2" color="#92400e">
              In setup flow: <Box component="span" sx={{ fontWeight: 700 }}>{setupCount}</Box>
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ bgcolor: "#fef2f2", borderColor: "#fca5a5" }}>
          <CardContent sx={{ py: "10px !important" }}>
            <Typography variant="body2" color="#b91c1c">
              Need intervention: <Box component="span" sx={{ fontWeight: 700 }}>{failedCount}</Box>
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: { xs: "grid", md: "none" }, gap: 1.5 }}>
        {tenants.map((tenant) => {
          const job = jobsByTenant[tenant.id];
          const plan = getPlanMeta(tenant.plan);
          const confirmationPhrase = tenant.subdomain.toUpperCase();
          const statusStyle = statusChipStyles(tenant.status);
          const billingBlocked = isTenantBillingBlockedFromOperations(tenant);

          return (
            <Card key={tenant.id} variant="outlined" sx={{ borderRadius: 3, bgcolor: rowTone(tenant.status) ?? "background.paper" }}>
              <CardContent sx={{ p: 2 }}>
                <Stack spacing={1.25}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{tenant.company_name}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {tenant.subdomain}
                    </Typography>
                    <Button
                      component="a"
                      href={`https://${tenant.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      size="small"
                      sx={{ textTransform: "none", p: 0, minWidth: 0, mt: 0.5 }}
                    >
                      {tenant.domain}
                    </Button>
                  </Box>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    <Chip size="small" label={plan?.label ?? tenant.plan} sx={{ ...planChipStyle(tenant.plan) }} />
                    <Chip size="small" label={tenant.status} color={statusStyle.color} sx={statusStyle.sx} />
                  </Box>

                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary">
                      Focus: <Box component="span" sx={{ color: "text.primary" }}>{tenant.chosen_app || "auto"}</Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Billing: <Box component="span" sx={{ color: "text.primary" }}>{getBillingLabel(tenant)}</Box>
                    </Typography>
                    {showPaymentChannel ? (
                      <Typography variant="caption" color="text.secondary">
                        Channel: <Box component="span" sx={{ color: "text.primary" }}>{tenant.payment_channel ? tenant.payment_channel.replace(/_/g, " ") : "—"}</Box>
                      </Typography>
                    ) : null}
                    <Typography variant="caption" color="text.secondary">
                      Created: <Box component="span" sx={{ color: "text.primary" }}>{formatDate(tenant.created_at)}</Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Health: <Box component="span" sx={{ color: "text.primary" }}>{statusHint(tenant.status, isAdminScope)}</Box>
                    </Typography>
                    {job ? (
                      <Typography variant="caption" color="text.secondary">
                        Job: <Box component="span" sx={{ color: "text.primary" }}>{job.status}</Box>
                      </Typography>
                    ) : null}
                  </Stack>

                  <Divider />

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    <Button component={Link} href={`/app/tenants/${tenant.id}/overview`} size="small" variant="outlined" sx={{ borderRadius: 999 }}>
                      Details
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="inherit"
                      sx={{ borderRadius: 999, bgcolor: "#0f172a", color: "#fff", "&:hover": { bgcolor: "#1e293b" } }}
                      disabled={busyTenantId === tenant.id || billingBlocked}
                      onClick={async () => {
                        if (billingBlocked) return;
                        setBusyTenantId(tenant.id);
                        try {
                          await onBackup(tenant.id);
                        } finally {
                          setBusyTenantId(null);
                        }
                      }}
                    >
                      Backup now
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="warning"
                      sx={{ borderRadius: 999 }}
                      disabled={billingBlocked}
                      onClick={() => {
                        if (billingBlocked) return;
                        setConfirmAction({ type: "reset", tenant, phrase: confirmationPhrase });
                        setConfirmInput("");
                        setNewPassword("");
                        setConfirmError(null);
                      }}
                    >
                      {isAdminScope ? "Reset admin login" : "Reset workspace login"}
                    </Button>
                    {onUpdatePlan ? (
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ borderRadius: 999 }}
                        onClick={() => {
                          setPlanActionTenant(tenant);
                          setPlanChoice(tenant.plan);
                          setPlanAppChoice(tenant.chosen_app || BUSINESS_APP_OPTIONS[0]?.id || "crm");
                        }}
                      >
                        Change plan
                      </Button>
                    ) : null}
                    {renderPaymentActions(tenant)}
                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      sx={{ borderRadius: 999 }}
                      onClick={() => {
                        setConfirmAction({ type: "delete", tenant, phrase: confirmationPhrase });
                        setConfirmInput("");
                        setConfirmError(null);
                      }}
                    >
                      Delete workspace
                    </Button>
                    {tenant.status.toLowerCase() === "failed" && onRetryProvisioning ? (
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ borderRadius: 999 }}
                        disabled={retryingTenantId === tenant.id}
                        onClick={() => {
                          void onRetryProvisioning(tenant.id);
                        }}
                      >
                        {retryingTenantId === tenant.id ? "Retrying..." : "Retry provisioning"}
                      </Button>
                    ) : null}
                    {job ? (
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ borderRadius: 999 }}
                        onClick={() => setExpandedTenantId((current) => (current === tenant.id ? null : tenant.id))}
                      >
                        {expandedTenantId === tenant.id ? "Hide logs" : "Show logs"}
                      </Button>
                    ) : null}
                  </Box>

                  {job && expandedTenantId === tenant.id ? (
                    <Box sx={{ pt: 1 }}>
                      <JobLogPanel
                        jobId={job.id}
                        logs={job.logs}
                        status={job.status}
                        onJobUpdate={(nextJob: Job) => {
                          onJobUpdate?.(nextJob);
                        }}
                      />
                    </Box>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      <TableContainer component={Card} variant="outlined" sx={{ borderRadius: 3, display: { xs: "none", md: "block" } }}>
        <Table size="small" sx={{ minWidth: 960 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: "rgba(37,99,235,0.06)" }}>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Workspace</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Package / focus</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Health</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Billing</TableCell>
              {showPaymentChannel ? <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Channel</TableCell> : null}
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Created</TableCell>
              <TableCell sx={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Quick actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenants.map((tenant) => {
              const job = jobsByTenant[tenant.id];
              const plan = getPlanMeta(tenant.plan);
              const confirmationPhrase = tenant.subdomain.toUpperCase();
              const statusStyle = statusChipStyles(tenant.status);
              const billingBlocked = isTenantBillingBlockedFromOperations(tenant);

              return (
                <Fragment key={tenant.id}>
                  <TableRow hover sx={{ verticalAlign: "top", bgcolor: rowTone(tenant.status) }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{tenant.company_name}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {tenant.subdomain}
                      </Typography>
                      <Button
                        component="a"
                        href={`https://${tenant.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        size="small"
                        sx={{ textTransform: "none", p: 0, minWidth: 0, mt: 0.5 }}
                      >
                        {tenant.domain}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "grid", gap: 0.5 }}>
                        <Chip size="small" label={plan?.label ?? tenant.plan} sx={{ width: "fit-content", ...planChipStyle(tenant.plan) }} />
                        <Typography variant="caption" color="text.secondary">
                          Focus: <Box component="span" sx={{ color: "text.primary" }}>{tenant.chosen_app || "auto"}</Box>
                        </Typography>
                        {tenant.payment_provider ? (
                          <Typography variant="caption" color="text.secondary">Provider: {tenant.payment_provider}</Typography>
                        ) : null}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={tenant.status} color={statusStyle.color} sx={statusStyle.sx} />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
                        {statusHint(tenant.status, isAdminScope)}
                      </Typography>
                      {job ? (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                          Job: {job.status}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{getBillingLabel(tenant)}</Typography>
                    </TableCell>
                    {showPaymentChannel ? (
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {tenant.payment_channel ? tenant.payment_channel.replace(/_/g, " ") : "—"}
                        </Typography>
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{formatDate(tenant.created_at)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                        <Button component={Link} href={`/app/tenants/${tenant.id}/overview`} size="small" variant="outlined" sx={{ borderRadius: 999 }}>
                          Details
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="inherit"
                          sx={{ borderRadius: 999, bgcolor: "#0f172a", color: "#fff", "&:hover": { bgcolor: "#1e293b" } }}
                          disabled={busyTenantId === tenant.id || billingBlocked}
                          onClick={async () => {
                            if (billingBlocked) return;
                            setBusyTenantId(tenant.id);
                            try {
                              await onBackup(tenant.id);
                            } finally {
                              setBusyTenantId(null);
                            }
                          }}
                        >
                          Backup now
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="warning"
                          sx={{ borderRadius: 999 }}
                          disabled={billingBlocked}
                          onClick={() => {
                            if (billingBlocked) return;
                            setConfirmAction({ type: "reset", tenant, phrase: confirmationPhrase });
                            setConfirmInput("");
                            setNewPassword("");
                            setConfirmError(null);
                          }}
                        >
                          {isAdminScope ? "Reset admin login" : "Reset workspace login"}
                        </Button>
                        {onUpdatePlan ? (
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ borderRadius: 999 }}
                            onClick={() => {
                              setPlanActionTenant(tenant);
                              setPlanChoice(tenant.plan);
                              setPlanAppChoice(tenant.chosen_app || BUSINESS_APP_OPTIONS[0]?.id || "crm");
                            }}
                          >
                            Change plan
                          </Button>
                        ) : null}
                        {renderPaymentActions(tenant)}
                        <Button
                          size="small"
                          variant="contained"
                          color="error"
                          sx={{ borderRadius: 999 }}
                          onClick={() => {
                            setConfirmAction({ type: "delete", tenant, phrase: confirmationPhrase });
                            setConfirmInput("");
                            setConfirmError(null);
                          }}
                        >
                          Delete workspace
                        </Button>
                        {tenant.status.toLowerCase() === "failed" && onRetryProvisioning ? (
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ borderRadius: 999 }}
                            disabled={retryingTenantId === tenant.id}
                            onClick={() => {
                              void onRetryProvisioning(tenant.id);
                            }}
                          >
                            {retryingTenantId === tenant.id ? "Retrying..." : "Retry provisioning"}
                          </Button>
                        ) : null}
                        {job ? (
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ borderRadius: 999 }}
                            onClick={() => setExpandedTenantId((current) => (current === tenant.id ? null : tenant.id))}
                          >
                            {expandedTenantId === tenant.id ? "Hide logs" : "Show logs"}
                          </Button>
                        ) : null}
                      </Box>
                    </TableCell>
                  </TableRow>

                  {job && expandedTenantId === tenant.id ? (
                    <TableRow sx={{ bgcolor: "#fffaf4" }}>
                      <TableCell colSpan={showPaymentChannel ? 7 : 6} sx={{ py: 2 }}>
                        <JobLogPanel
                          jobId={job.id}
                          logs={job.logs}
                          status={job.status}
                          onJobUpdate={(nextJob: Job) => {
                            onJobUpdate?.(nextJob);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(confirmAction)} onClose={isSubmitting ? undefined : closeConfirm} fullWidth maxWidth="sm">
        <DialogTitle>
          {confirmAction?.type === "delete"
            ? "Confirm workspace deletion"
            : isAdminScope
            ? "Confirm admin password reset"
            : "Confirm workspace password reset"}
        </DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
          {confirmAction ? (
            <>
              <Typography variant="body2" color="text.secondary">
                Tenant: <Box component="span" sx={{ color: "text.primary", fontWeight: 700 }}>{confirmAction.tenant.company_name}</Box>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Type <Chip label={confirmAction.phrase} size="small" sx={{ fontFamily: "monospace" }} /> to continue.
              </Typography>
            </>
          ) : null}
          <TextField
            value={confirmInput}
            onChange={(event) => setConfirmInput(event.target.value.toUpperCase())}
            placeholder="Type confirmation text"
            fullWidth
            size="small"
          />
          {confirmAction?.type === "reset" ? (
            <TextField
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Optional: set a specific new password"
              fullWidth
              size="small"
            />
          ) : null}
          {confirmError ? (
            <Typography variant="body2" color="error">
              {confirmError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button disabled={isSubmitting} onClick={closeConfirm}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={isSubmitting || confirmInput !== confirmAction?.phrase}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isSubmitting ? "Processing..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(planActionTenant)} onClose={planBusy ? undefined : closePlanModal} fullWidth maxWidth="sm">
        <DialogTitle>Change plan</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
          {planActionTenant ? (
            <Typography variant="body2" color="text.secondary">
              Tenant: <Box component="span" sx={{ color: "text.primary", fontWeight: 700 }}>{planActionTenant.company_name}</Box>
            </Typography>
          ) : null}
          <FormControl fullWidth size="small">
            <InputLabel id="tenant-plan-label">Plan</InputLabel>
            <Select
              labelId="tenant-plan-label"
              label="Plan"
              value={planChoice}
              onChange={(event) => setPlanChoice(event.target.value)}
            >
              <MenuItem value="starter">Starter</MenuItem>
              <MenuItem value="business">Business</MenuItem>
              <MenuItem value="enterprise">Enterprise</MenuItem>
            </Select>
          </FormControl>
          {planChoice === "business" ? (
            <FormControl fullWidth size="small">
              <InputLabel id="tenant-plan-focus-label">Business focus</InputLabel>
              <Select
                labelId="tenant-plan-focus-label"
                label="Business focus"
                value={planAppChoice}
                onChange={(event) => setPlanAppChoice(event.target.value)}
              >
                {BUSINESS_APP_OPTIONS.map((option: { id: string; label: string }) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
          {planError ? (
            <Typography variant="body2" color="error">
              {planError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePlanModal}>Cancel</Button>
          <Button
            variant="contained"
            sx={{ bgcolor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }}
            disabled={planBusy || (planActionTenant ? updatingTenantId === planActionTenant.id : false)}
            onClick={() => void submitPlanUpdate()}
          >
            {planBusy || (planActionTenant ? updatingTenantId === planActionTenant.id : false) ? "Updating..." : "Confirm change"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
