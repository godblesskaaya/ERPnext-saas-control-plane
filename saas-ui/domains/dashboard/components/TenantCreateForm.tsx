"use client";

import { useEffect, useMemo, useState } from "react";
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
  TextField,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";

import type { TenantCreatePayload, TenantCreateResponse } from "../../shared/lib/types";
import { BUSINESS_APP_OPTIONS, PLAN_OPTIONS } from "../../onboarding/components/PlanSelector";
import { createWorkspaceTenant, toWorkspaceQueueErrorMessage } from "../../tenant-ops/application/workspaceQueueUseCases";

type Props = {
  onCreated: (result: TenantCreateResponse) => void | Promise<void>;
  canCreate?: boolean;
  verificationNotice?: string | null;
  onResendVerification?: () => Promise<void>;
};

const DOMAIN_SUFFIX = (process.env.NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX ?? "erp.blenkotechnologies.co.tz").trim();

function normalizeSubdomain(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function TenantCreateForm({ onCreated, canCreate = true, verificationNotice, onResendVerification }: Props) {
  const [subdomain, setSubdomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [chosenApp, setChosenApp] = useState("erpnext");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<TenantCreateResponse | null>(null);

  const normalizedSubdomain = useMemo(() => normalizeSubdomain(subdomain), [subdomain]);
  const domainPreview = normalizedSubdomain ? `${normalizedSubdomain}.${DOMAIN_SUFFIX}` : `your-company.${DOMAIN_SUFFIX}`;

  useEffect(() => {
    if (plan.toLowerCase() !== "business") {
      setChosenApp("erpnext");
    }
  }, [plan]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      setError("Verify your email before creating a workspace.");
      return;
    }
    setBusy(true);
    setError(null);

    if (normalizedSubdomain.length < 3) {
      setBusy(false);
      setError("Subdomain must be at least 3 characters.");
      return;
    }

    if (!companyName.trim()) {
      setBusy(false);
      setError("Company name is required.");
      return;
    }

    const payload: TenantCreatePayload = {
      subdomain: normalizedSubdomain,
      company_name: companyName.trim(),
      plan,
    };

    if (plan.toLowerCase() === "business") {
      payload.chosen_app = chosenApp;
    }

    try {
      const result = await createWorkspaceTenant(payload);
      setCreated(result);
      setSubdomain("");
      setCompanyName("");
      await onCreated(result);
    } catch (err) {
      setError(toWorkspaceQueueErrorMessage(err, "Failed to create tenant"));
    } finally {
      setBusy(false);
    }
  };

  const selectedBusinessApp = BUSINESS_APP_OPTIONS.find((option) => option.id === chosenApp);

  return (
    <Card component="form" id="create-tenant" onSubmit={submit} variant="outlined">
      <CardContent sx={{ p: { xs: 2.5, md: 3 }, "&:last-child": { pb: { xs: 2.5, md: 3 } } }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} color="text.primary">
              Launch a workspace your team can use today
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Reserve tenant identity, choose operating level, and continue to payment when needed.
            </Typography>
          </Box>

          {!canCreate ? (
            <Alert
              severity="warning"
              action={
                onResendVerification ? (
                  <Button size="small" color="warning" onClick={() => void onResendVerification()}>
                    Resend verification email
                  </Button>
                ) : undefined
              }
            >
              <Typography variant="subtitle2">Email verification required</Typography>
              <Typography variant="body2">Please verify your email before creating a workspace.</Typography>
              {verificationNotice ? <Typography variant="body2">{verificationNotice}</Typography> : null}
            </Alert>
          ) : null}

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
            <Box>
              <TextField
                id="subdomain-input"
                label="Subdomain"
                placeholder="mlimani"
                value={subdomain}
                onChange={(event) => setSubdomain(normalizeSubdomain(event.target.value))}
                required
                fullWidth
              />
              <Typography variant="caption" color="text.secondary">
                Tenant URL preview: {domainPreview}
              </Typography>
            </Box>

            <Box>
              <TextField
                id="company-input"
                label="Company name"
                placeholder="Mlimani Traders Ltd"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
                fullWidth
              />
              <Typography variant="caption" color="text.secondary">
                Shown in tenant records, billing, and internal ops reporting.
              </Typography>
            </Box>
          </Box>

          <FormControl fullWidth>
            <InputLabel id="plan-select-label">Choose rollout level</InputLabel>
            <Select
              labelId="plan-select-label"
              label="Choose rollout level"
              value={plan}
              onChange={(event: SelectChangeEvent) => setPlan(event.target.value)}
            >
              {PLAN_OPTIONS.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label} — {option.price}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {plan.toLowerCase() === "business" ? (
            <FormControl fullWidth>
              <InputLabel id="business-app-select-label">Business focus area</InputLabel>
              <Select
                labelId="business-app-select-label"
                label="Business focus area"
                value={chosenApp}
                onChange={(event: SelectChangeEvent) => setChosenApp(event.target.value)}
              >
                {BUSINESS_APP_OPTIONS.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label} ({option.profile})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}

          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "rgba(37,99,235,0.05)" }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Request preview
              </Typography>
              <Typography variant="body2">Plan: {plan}</Typography>
              {plan.toLowerCase() === "business" ? (
                <Typography variant="body2">Chosen app: {selectedBusinessApp?.label ?? chosenApp}</Typography>
              ) : (
                <Typography variant="body2">Chosen app: auto-managed by selected plan</Typography>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                What happens next
              </Typography>
              <Typography variant="body2">• Payment step appears only when required by your backend flow.</Typography>
              <Typography variant="body2">• Provisioning status updates live after request submission.</Typography>
              <Typography variant="body2">
                • Designed for teams coordinating from laptop + phone across Tanzania.
              </Typography>
            </Paper>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Button disabled={busy || !canCreate} type="submit" variant="contained">
              {busy ? "Submitting workspace..." : "Create workspace"}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Duplicate-submit protection is active.
            </Typography>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {created ? (
            <Alert
              severity="success"
              action={
                created.checkout_url ? (
                  <Button color="success" href={created.checkout_url} target="_blank" rel="noreferrer">
                    Continue to payment
                  </Button>
                ) : undefined
              }
            >
              <Typography variant="subtitle2">Workspace request accepted</Typography>
              <Typography variant="body2">Domain: {created.tenant.domain}</Typography>
              <Typography variant="body2">Status: {created.tenant.status}</Typography>
              {plan.toLowerCase() === "business" ? (
                <Typography variant="body2">Business focus: {selectedBusinessApp?.label ?? chosenApp}</Typography>
              ) : null}
              {!created.checkout_url ? (
                <Typography variant="body2">
                  Checkout link not returned. Contact support if payment is expected.
                </Typography>
              ) : null}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
