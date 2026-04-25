"use client";

import { useEffect, useState } from "react";
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
  Typography,
} from "@mui/material";

import { loadBillingWorkspaceSnapshot, toBillingErrorMessage } from "../../../../../domains/billing/application/billingUseCases";
import { FeatureUnavailable } from "../../../../../domains/shared/components/FeatureUnavailable";
import { formatMoney as formatCurrency, formatTimestamp } from "../../../../../domains/shared/lib/formatters";
import { EmptyState, PageHeader } from "../../../../../domains/shell/components";
import type { BillingInvoice } from "../../../../../domains/shared/lib/types";


function invoiceAction(invoice: BillingInvoice): { label: string; href: string } | null {
  if (invoice.hosted_invoice_url) return { label: "Resume payment", href: invoice.hosted_invoice_url };
  if (invoice.invoice_pdf) return { label: "Download", href: invoice.invoice_pdf };
  return null;
}

function statusChipColor(status?: string | null): "default" | "success" | "warning" | "error" {
  const value = (status ?? "").toLowerCase();
  if (value === "paid" || value === "settled" || value === "closed") return "success";
  if (value === "past_due" || value === "overdue" || value === "failed" || value === "uncollectible") return "error";
  if (value === "open" || value === "unpaid" || value === "draft") return "warning";
  return "default";
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const snapshot = await loadBillingWorkspaceSnapshot();
        if (!active) return;
        setPortalUrl(snapshot.portalUrl);
        if (!snapshot.invoicesSupported) {
          setSupported(false);
          setInvoices([]);
          return;
        }
        setSupported(true);
        setInvoices(snapshot.invoices);
      } catch (err) {
        if (!active) return;
        setError(toBillingErrorMessage(err, "Failed to load invoices"));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Billing"
        title="Invoices"
        subtitle="Review your invoice history and follow up on outstanding payments."
        actions={
          portalUrl ? (
            <Button
              variant="contained"
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
            >
              Open invoice portal
            </Button>
          ) : null
        }
      />

      {!supported ? (
        <FeatureUnavailable feature="Invoices" detail="Contact support if this persists." />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : invoices.length === 0 ? (
        <EmptyState title="No invoices yet" description="Invoices will appear here once your workspace is billed." />
      ) : (
        <>
          {/* Mobile: card list */}
          <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
            {invoices.map((invoice) => {
              const action = invoiceAction(invoice);
              return (
                <Card key={invoice.id} variant="outlined" sx={{ borderRadius: 3 }}>
                  <CardContent sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {invoice.metadata?.company_name ?? invoice.metadata?.tenant_domain ?? "Workspace"}
                        </Typography>
                        <Chip
                          size="small"
                          label={invoice.status ?? "—"}
                          color={statusChipColor(invoice.status)}
                          variant="outlined"
                        />
                      </Stack>
                      <Stack direction="row" spacing={3}>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Amount due
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {formatCurrency(invoice.amount_due ?? undefined, invoice.currency)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Paid
                          </Typography>
                          <Typography variant="body2">
                            {formatCurrency(invoice.amount_paid ?? undefined, invoice.currency)}
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(invoice.created_at)}
                      </Typography>
                      {action ? (
                        <Link href={action.href} target="_blank" rel="noreferrer" underline="hover" sx={{ fontWeight: 600 }}>
                          {action.label}
                        </Link>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>

          {/* Desktop: table */}
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, display: { xs: "none", md: "block" } }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: "grey.50" }}>
                <TableRow>
                  <TableCell>Workspace</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Amount due</TableCell>
                  <TableCell align="right">Amount paid</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.map((invoice) => {
                  const action = invoiceAction(invoice);
                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {invoice.metadata?.company_name ?? invoice.metadata?.tenant_domain ?? "Workspace"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                            {invoice.id}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={invoice.status ?? "—"}
                          color={statusChipColor(invoice.status)}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {formatCurrency(invoice.amount_due ?? undefined, invoice.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(invoice.amount_paid ?? undefined, invoice.currency)}
                      </TableCell>
                      <TableCell>{formatTimestamp(invoice.created_at)}</TableCell>
                      <TableCell align="right">
                        {action ? (
                          <Link href={action.href} target="_blank" rel="noreferrer" underline="hover" sx={{ fontWeight: 600 }}>
                            {action.label}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Stack>
  );
}
