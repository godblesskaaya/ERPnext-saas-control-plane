"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BUSINESS_APP_OPTIONS } from "../../../../../../domains/onboarding/components/PlanSelector";
import { loadPublicPlanCatalog } from "../../../../../../domains/subscription/application/subscriptionUseCases";
import {
  fallbackPlanCatalog,
  type PlanCatalogItem,
} from "../../../../../../domains/subscription/domain/planCatalog";
import { ConfirmActionDialog } from "../../../../../../domains/shared/components/ConfirmActionDialog";
import {
  renewTenantCheckout,
  toTenantDetailErrorMessage,
  updateTenantPlanDetails,
} from "../../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { TenantSubscriptionSection } from "../../../../../../domains/tenant-ops/ui/tenant-detail/sections";
import { TenantWorkspacePageLayout } from "../../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import {
  useTenantRouteContext,
  useTenantSubscriptionData,
} from "../../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantBillingPage() {
  const params = useParams<{ tenantId: string }>();
  const id = params.tenantId;
  const { tenant, error, loadTenant } = useTenantRouteContext(id);
  const {
    subscription,
    subscriptionSupported,
    subscriptionError,
    loadSubscription,
  } = useTenantSubscriptionData(id);
  const [planChoice, setPlanChoice] = useState(tenant?.plan ?? "starter");
  const [planAppChoice, setPlanAppChoice] = useState(
    tenant?.chosen_app || BUSINESS_APP_OPTIONS[0]?.id || "crm",
  );
  const [planBusy, setPlanBusy] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanCatalogItem[]>(fallbackPlanCatalog);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [confirmPlanOpen, setConfirmPlanOpen] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await loadPublicPlanCatalog();
        if (active) {
          setPlans(loaded);
          setPlansError(null);
        }
      } catch (err) {
        if (active) {
          setPlansError(
            toTenantDetailErrorMessage(err, "Failed to load plan pricing."),
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const currentPlan = useMemo(
    () =>
      plans.find(
        (plan) => plan.slug === tenant?.plan || plan.id === tenant?.plan,
      ),
    [plans, tenant?.plan],
  );
  const selectedPlan = useMemo(
    () =>
      plans.find((plan) => plan.slug === planChoice || plan.id === planChoice),
    [planChoice, plans],
  );
  const isDowngrade = Boolean(
    currentPlan &&
    selectedPlan &&
    selectedPlan.monthlyPriceTzs < currentPlan.monthlyPriceTzs,
  );
  const subscriptionStatus = (subscription?.status ?? "").toLowerCase();
  const showPaymentRetry =
    subscriptionSupported &&
    ["past_due", "pending"].includes(subscriptionStatus);

  const submitPlanChange = async () => {
    if (!tenant) return;
    setPlanBusy(true);
    setPlanNotice(null);
    setPlanError(null);
    try {
      const payload =
        planChoice === "business"
          ? { plan: planChoice, chosen_app: planAppChoice }
          : { plan: planChoice };
      const result = await updateTenantPlanDetails(tenant.id, payload);
      if (!result.supported) {
        setPlanError("Plan update endpoint is not available on this backend.");
        return;
      }
      setPlanNotice("Tenant plan updated successfully.");
      setConfirmPlanOpen(false);
      await loadTenant();
      await loadSubscription();
    } catch (err) {
      setPlanError(
        err instanceof Error ? err.message : "Failed to update tenant plan.",
      );
    } finally {
      setPlanBusy(false);
    }
  };

  const retryPayment = async () => {
    if (!tenant) return;
    setRetryBusy(true);
    setRetryError(null);
    try {
      const result = await renewTenantCheckout(tenant.id);
      if (!result.supported) {
        setRetryError("Checkout renewal is not available on this backend.");
        return;
      }
      if (result.data.checkout_url) {
        window.open(result.data.checkout_url, "_blank", "noopener,noreferrer");
        setPlanNotice("Payment link opened in a new tab.");
      } else {
        setPlanNotice("Payment link generated.");
      }
      await loadSubscription();
    } catch (err) {
      setRetryError(
        toTenantDetailErrorMessage(err, "Failed to generate payment link."),
      );
    } finally {
      setRetryBusy(false);
    }
  };

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  // Contract marker: tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Billing & subscription"
      tenantContext={
        tenant
          ? `${tenant.company_name} (${tenant.domain})`
          : "Loading tenant context..."
      }
      footerError={error}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 3,
          borderRadius: 4,
          borderColor: "divider",
          backgroundColor: "background.paper",
          mb: 3,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
        >
          <Box>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
              Plan controls
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Pricing changes were moved out of list views. Use this tenant
              billing surface for plan updates.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                void loadSubscription();
                void loadTenant();
              }}
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
            >
              Refresh billing
            </Button>
          </Stack>
        </Stack>

        <Card variant="outlined" sx={{ mt: 2, borderRadius: 3 }}>
          <CardContent sx={{ display: "grid", gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Change plan
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Current plan:{" "}
              <Box
                component="span"
                sx={{ color: "text.primary", fontWeight: 700 }}
              >
                {tenant?.plan ?? "—"}
              </Box>
              {tenant?.chosen_app ? ` · Focus app: ${tenant.chosen_app}` : ""}
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel id="tenant-billing-plan-label">Plan</InputLabel>
                <Select
                  labelId="tenant-billing-plan-label"
                  label="Plan"
                  value={planChoice}
                  onChange={(event) => setPlanChoice(event.target.value)}
                >
                  {plans.map((plan) => (
                    <MenuItem key={plan.slug} value={plan.slug}>
                      {plan.label} — TZS {plan.monthlyPriceTzs.toLocaleString()}/mo
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {planChoice === "business" ? (
                <FormControl fullWidth size="small">
                  <InputLabel id="tenant-billing-app-label">
                    Business focus
                  </InputLabel>
                  <Select
                    labelId="tenant-billing-app-label"
                    label="Business focus"
                    value={planAppChoice}
                    onChange={(event) => setPlanAppChoice(event.target.value)}
                  >
                    {BUSINESS_APP_OPTIONS.map((option) => (
                      <MenuItem key={option.id} value={option.id}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : null}
            </Stack>
            {plansError ? <Alert severity="warning">{plansError}</Alert> : null}
            {isDowngrade ? (
              <Alert severity="warning">
                Downgrading may reduce backup retention and remove access to
                some features.
              </Alert>
            ) : null}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                variant="contained"
                size="small"
                disabled={planBusy}
                onClick={() => setConfirmPlanOpen(true)}
                sx={{
                  borderRadius: 99,
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                {planBusy ? "Updating..." : "Update tenant plan"}
              </Button>
            </Stack>
            {planNotice ? <Alert severity="success">{planNotice}</Alert> : null}
            {planError ? <Alert severity="error">{planError}</Alert> : null}
          </CardContent>
        </Card>
      </Paper>

      {showPaymentRetry ? (
        <Paper
          variant="outlined"
          sx={{ p: 3, borderRadius: 4, borderColor: "warning.light", mb: 3 }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Payment recovery
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Generate a fresh checkout link for this subscription.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              disabled={retryBusy}
              onClick={() => void retryPayment()}
            >
              {retryBusy ? "Generating..." : "Generate payment link"}
            </Button>
          </Stack>
          {retryError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {retryError}
            </Alert>
          ) : null}
        </Paper>
      ) : null}

      <TenantSubscriptionSection
        subscriptionError={subscriptionError}
        subscriptionSupported={subscriptionSupported}
        subscription={subscription}
        onRefresh={() => {
          void loadSubscription();
        }}
        formatTimestamp={formatTimestamp}
      />
      <ConfirmActionDialog
        open={confirmPlanOpen}
        title="Update tenant plan"
        body="Confirm this plan change. Billing may be prorated by the provider, and downgrades can reduce feature access."
        confirmLabel="Update tenant plan"
        busy={planBusy}
        onConfirm={() => void submitPlanChange()}
        onCancel={() => setConfirmPlanOpen(false)}
      />
    </TenantWorkspacePageLayout>
  );
}
