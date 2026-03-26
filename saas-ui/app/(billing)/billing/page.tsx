"use client";

import { useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { loadBillingWorkspaceSnapshot, toBillingErrorMessage } from "../../../domains/billing/application/billingUseCases";
import type { BillingInvoice } from "../../../domains/shared/lib/types";

function formatCurrency(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return "—";
  const normalized = currency ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: normalized }).format(amount / 100);
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const snapshot = await loadBillingWorkspaceSnapshot();
        setPortalUrl(snapshot.portalUrl);
        if (!snapshot.invoicesSupported) {
          setSupported(false);
          setInvoices([]);
          return;
        }
        setSupported(true);
        setInvoices(snapshot.invoices);
      } catch (err) {
        setError(toBillingErrorMessage(err, "Failed to load invoices"));
      }
    };

    void load();
  }, []);

  return (
    <Stack spacing={2.5}>
      <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "warning.light" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
          <Box>
            <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
              Payment center
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Billing & invoices
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Review invoice history and resume pending payments.
            </Typography>
          </Box>
          {portalUrl ? (
            <Button variant="contained" href={portalUrl} target="_blank" rel="noreferrer" sx={{ borderRadius: 999 }}>
              Open billing workspace
            </Button>
          ) : null}
        </Stack>
      </Paper>

      {!supported ? (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Invoice history is not available for the active payment provider.
        </Alert>
      ) : error ? (
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          {error}
        </Alert>
      ) : invoices.length ? (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, borderColor: "warning.light" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "rgba(245,158,11,0.08)" }}>
                <TableCell>Workspace</TableCell>
                <TableCell>Invoice</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Amount due</TableCell>
                <TableCell>Amount paid</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Link</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id} hover>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {invoice.metadata?.company_name ?? invoice.metadata?.tenant_domain ?? "—"}
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{invoice.id}</TableCell>
                  <TableCell>{invoice.status ?? "—"}</TableCell>
                  <TableCell>{formatCurrency(invoice.amount_due ?? undefined, invoice.currency)}</TableCell>
                  <TableCell>{formatCurrency(invoice.amount_paid ?? undefined, invoice.currency)}</TableCell>
                  <TableCell>{formatTimestamp(invoice.created_at)}</TableCell>
                  <TableCell>
                    {invoice.hosted_invoice_url ? (
                      <Link href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" underline="hover">
                        Resume payment
                      </Link>
                    ) : invoice.invoice_pdf ? (
                      <Link href={invoice.invoice_pdf} target="_blank" rel="noreferrer" underline="hover">
                        Download
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          No invoices found yet.
        </Alert>
      )}
    </Stack>
  );
}
