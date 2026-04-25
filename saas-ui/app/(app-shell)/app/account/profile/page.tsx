"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  Typography,
} from "@mui/material";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";

import {
  loadAccountBillingInvoices,
  loadAccountBillingPortal,
  loadAccountProfile,
  pickLatestInvoice,
  toAccountErrorMessage,
} from "../../../../../domains/account/application/accountUseCases";
import { FeatureUnavailable } from "../../../../../domains/shared/components/FeatureUnavailable";
import { formatMoney, formatTimestamp } from "../../../../../domains/shared/lib/formatters";
import { PageHeader } from "../../../../../domains/shell/components";
import type { BillingInvoice, UserProfile } from "../../../../../domains/shared/lib/types";


function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ mt: 0.25, fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
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
  const verified = profile?.email_verified ?? false;

  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Account"
        title="Profile"
        subtitle="Your identity, contact details, and billing snapshot."
        actions={
          <Button
            component={NextLink}
            href="/app/account/settings"
            variant="contained"
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Update settings
          </Button>
        }
      />

      {profileError ? <Alert severity="error">{profileError}</Alert> : null}

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={3}
          divider={<Box sx={{ borderRight: { md: "1px solid" }, borderColor: { md: "divider" } }} />}
        >
          <DetailItem label="Email" value={profile?.email ?? "—"} />
          <DetailItem label="Role" value={profile?.role ?? "—"} />
          <DetailItem label="Phone" value={profile?.phone || "Not set"} />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
              Email verification
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
              {verified ? (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  icon={<VerifiedOutlinedIcon sx={{ fontSize: 16 }} />}
                  label="Verified"
                />
              ) : (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  icon={<ErrorOutlineOutlinedIcon sx={{ fontSize: 16 }} />}
                  label="Pending"
                />
              )}
              {!verified ? (
                <Button component={NextLink} href="/verify-email" size="small" sx={{ textTransform: "none" }}>
                  Verify now
                </Button>
              ) : null}
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
        }}
      >
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ display: "grid", gap: 1.5 }}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
                Billing portal
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.25 }}>
                Manage invoices &amp; payments
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Open the billing portal to review invoices, update payment methods, and follow up on collections.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {portalUrl ? (
                <Button
                  component="a"
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  variant="contained"
                  sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                >
                  Open invoice portal
                </Button>
              ) : (
                <Button
                  component={NextLink}
                  href="/app/billing/invoices"
                  variant="outlined"
                  sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                >
                  View invoices
                </Button>
              )}
            </Stack>
            {portalError ? (
              <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
                {portalError}
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
              Latest invoice
            </Typography>
            {!invoicesSupported ? (
              <FeatureUnavailable feature="Invoice history" />
            ) : latestInvoice ? (
              <Stack spacing={1}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {formatMoney(latestInvoice.amount_due, latestInvoice.currency)}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={latestInvoice.status ?? "unknown"} variant="outlined" />
                  <Chip size="small" label={formatTimestamp(latestInvoice.created_at ?? null)} variant="outlined" />
                </Stack>
                {latestInvoice.hosted_invoice_url ? (
                  <Link
                    href={latestInvoice.hosted_invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                    sx={{ fontWeight: 600, mt: 0.5 }}
                  >
                    View invoice →
                  </Link>
                ) : null}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No invoices billed yet.
              </Typography>
            )}
            {invoiceError ? (
              <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
                {invoiceError}
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
