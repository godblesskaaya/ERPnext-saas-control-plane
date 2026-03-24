"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import {
  loadAccountBillingInvoices,
  loadAccountBillingPortal,
  loadAccountProfile,
  pickLatestInvoice,
  toAccountErrorMessage,
} from "../../../../domains/account/application/accountUseCases";
import type { BillingInvoice, UserProfile } from "../../../../domains/shared/lib/types";

function formatMoney(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return "—";
  const code = (currency || "usd").toUpperCase();
  const value = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function DashboardAccountPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoicesSupported, setInvoicesSupported] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await loadAccountProfile();
        if (!active) return;
        setProfile(next);
        setProfileError(null);
      } catch (err) {
        if (!active) return;
        setProfileError(toAccountErrorMessage(err, "Failed to load profile"));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await loadAccountBillingPortal();
        if (!active) return;
        if (!result.supported) {
          setPortalUrl(null);
          return;
        }
        setPortalUrl(result.url);
      } catch (err) {
        if (!active) return;
        setPortalError(toAccountErrorMessage(err, "Billing portal unavailable"));
      }
    })();

    void (async () => {
      try {
        const result = await loadAccountBillingInvoices();
        if (!active) return;
        if (!result.supported) {
          setInvoicesSupported(false);
          setInvoices([]);
          return;
        }
        setInvoicesSupported(true);
        setInvoices(result.invoices);
      } catch (err) {
        if (!active) return;
        setInvoiceError(toAccountErrorMessage(err, "Failed to load invoices"));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const latestInvoice = useMemo(() => pickLatestInvoice(invoices), [invoices]);

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 3, borderRadius: 4 }}>
        <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
          Account workspace
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
          Account summary
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Identity, billing, and readiness details for your control-plane account.
        </Typography>
      </Paper>

      {profileError ? <Alert severity="error" variant="outlined">{profileError}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%", borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                Email
              </Typography>
              <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 700 }}>{profile?.email ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%", borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                Role
              </Typography>
              <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 700 }}>{profile?.role ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%", borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                Phone (SMS)
              </Typography>
              <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 700 }}>{profile?.phone || "Not set"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%", borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
                Email verification
              </Typography>
              <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 700 }}>
                {profile?.email_verified ? "Verified" : "Pending"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 2.5, borderRadius: 4, height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Billing workspace
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Continue collections, invoice reviews, and payment follow-up from your billing workspace.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              {portalUrl ? (
                <Button component="a" href={portalUrl} target="_blank" rel="noreferrer" variant="contained" color="primary" size="small">
                  Open billing portal
                </Button>
              ) : (
                <Button component={NextLink} href="/billing" variant="outlined" color="warning" size="small">
                  Open payment center
                </Button>
              )}
            </Stack>
            {portalError ? (
              <Typography variant="caption" color="error" sx={{ display: "block", mt: 1.25 }}>
                {portalError}
              </Typography>
            ) : null}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ borderColor: "warning.light", p: 2.5, borderRadius: 4, height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Latest invoice snapshot
            </Typography>
            {!invoicesSupported ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Invoice endpoint is not available on this backend deployment.
              </Typography>
            ) : latestInvoice ? (
              <Stack spacing={0.5} sx={{ mt: 1.25 }}>
                <Typography variant="body2">
                  Amount due: <strong>{formatMoney(latestInvoice.amount_due, latestInvoice.currency)}</strong>
                </Typography>
                <Typography variant="body2">
                  Status: <strong>{latestInvoice.status ?? "unknown"}</strong>
                </Typography>
                <Typography variant="body2">
                  Created: <strong>{formatTimestamp(latestInvoice.created_at ?? null)}</strong>
                </Typography>
                {latestInvoice.hosted_invoice_url ? (
                  <Link href={latestInvoice.hosted_invoice_url} target="_blank" rel="noreferrer" underline="hover" sx={{ mt: 0.75 }}>
                    View invoice
                  </Link>
                ) : null}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No invoice data available yet.
              </Typography>
            )}
            {invoiceError ? (
              <Typography variant="caption" color="error" sx={{ display: "block", mt: 1.25 }}>
                {invoiceError}
              </Typography>
            ) : null}
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
