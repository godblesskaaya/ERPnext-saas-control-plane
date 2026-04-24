"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Button,
  Grid,
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

import { ConfirmActionDialog } from "../../../../shared/components/ConfirmActionDialog";
import { api, getApiErrorMessage } from "../../../../shared/lib/api";
import type { Tenant } from "../../../../shared/lib/types";
import { TenantStatusChip } from "../../../../shared/components/TenantStatusChip";
import { formatTimestamp } from "../../../../shared/lib/tenantDisplayUtils";

type AdminTenantsViewProps = {
  tenantsError: string | null;
  onRefreshTenants: () => void;
  tenantSearch: string;
  onTenantSearchChange: (value: string) => void;
  tenantStatusFilter: string;
  onTenantStatusFilterChange: (value: string) => void;
  tenantPlanFilter: string;
  onTenantPlanFilterChange: (value: string) => void;
  tenants: Tenant[];
  tenantPage: number;
  tenantTotalPages: number;
  tenantTotal: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  canRunAdminOnlyActions?: boolean;
};

export function AdminTenantsView({
  tenantsError,
  onRefreshTenants,
  tenantSearch,
  onTenantSearchChange,
  tenantStatusFilter,
  onTenantStatusFilterChange,
  tenantPlanFilter,
  onTenantPlanFilterChange,
  tenants,
  tenantPage,
  tenantTotalPages,
  tenantTotal,
  onPreviousPage,
  onNextPage,
  canRunAdminOnlyActions = true,
}: AdminTenantsViewProps) {
  const [impersonationTenant, setImpersonationTenant] = useState<Tenant | null>(
    null,
  );
  const [impersonationBusy, setImpersonationBusy] = useState(false);
  const [impersonationError, setImpersonationError] = useState<string | null>(
    null,
  );
  const [impersonationNotice, setImpersonationNotice] = useState<string | null>(
    null,
  );

  const issueTenantImpersonation = async () => {
    if (!impersonationTenant) return;
    const targetEmail = impersonationTenant.owner_email;
    if (!targetEmail) {
      setImpersonationError(
        "Tenant owner email is not available in this admin response.",
      );
      return;
    }
    setImpersonationBusy(true);
    setImpersonationError(null);
    setImpersonationNotice(null);
    try {
      const result = await api.requestImpersonationLink(
        targetEmail,
        `Support troubleshooting for tenant ${impersonationTenant.id}`,
      );
      if (!result.supported) {
        setImpersonationError(
          "Impersonation endpoint is not available on this backend.",
        );
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
      setImpersonationNotice(`Impersonation link opened for ${targetEmail}.`);
      setImpersonationTenant(null);
    } catch (err) {
      setImpersonationError(
        getApiErrorMessage(err, "Failed to create impersonation link."),
      );
    } finally {
      setImpersonationBusy(false);
    }
  };

  return (
    <>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ sm: "center" }}
          gap={1.5}
          sx={{ mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Tenant intervention panel
          </Typography>
          <Button size="small" variant="outlined" onClick={onRefreshTenants}>
            Refresh
          </Button>
        </Stack>

        {tenantsError ? (
          <Typography variant="body2" color="error.main" sx={{ mb: 1.5 }}>
            {tenantsError}
          </Typography>
        ) : null}
        {impersonationNotice ? (
          <Typography variant="body2" color="success.main" sx={{ mb: 1.5 }}>
            {impersonationNotice}
          </Typography>
        ) : null}
        {impersonationError ? (
          <Typography variant="body2" color="error.main" sx={{ mb: 1.5 }}>
            {impersonationError}
          </Typography>
        ) : null}

        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by company, subdomain, or domain"
              value={tenantSearch}
              onChange={(event) => onTenantSearchChange(event.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 3.5 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Status"
              SelectProps={{ native: true }}
              value={tenantStatusFilter}
              onChange={(event) =>
                onTenantStatusFilterChange(event.target.value)
              }
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_payment">Pending payment</option>
              <option value="pending">Pending</option>
              <option value="provisioning">Provisioning</option>
              <option value="failed">Failed</option>
              <option value="suspended">Suspended (all)</option>
              <option value="suspended_admin">Suspended (admin)</option>
              <option value="suspended_billing">Suspended (billing)</option>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3.5 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Plan"
              SelectProps={{ native: true }}
              value={tenantPlanFilter}
              onChange={(event) => onTenantPlanFilterChange(event.target.value)}
            >
              <option value="all">All plans</option>
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </TextField>
          </Grid>
        </Grid>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Company</TableCell>
                <TableCell>Plan/focus</TableCell>
                <TableCell>Health</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tenants.map((tenant) => {
                return (
                  <TableRow key={tenant.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {tenant.company_name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {tenant.domain}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {tenant.id}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      <Typography variant="caption" display="block">
                        {tenant.plan}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {tenant.chosen_app || "auto"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <TenantStatusChip status={tenant.status} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>
                      {tenant.payment_provider || "n/a"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>
                      {formatTimestamp(tenant.created_at)}
                    </TableCell>
                    <TableCell>
                      <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        useFlexGap
                        alignItems="center"
                      >
                        <Button
                          component={Link}
                          href={`/app/tenants/${tenant.id}/overview`}
                          size="small"
                          variant="outlined"
                        >
                          Details
                        </Button>
                        {canRunAdminOnlyActions ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={() => {
                              setImpersonationTenant(tenant);
                              setImpersonationError(null);
                              setImpersonationNotice(null);
                            }}
                          >
                            Impersonate owner
                          </Button>
                        ) : null}
                        <Typography variant="caption" color="text.secondary">
                          Suspend, unsuspend, and billing recovery live on tenant details.
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {!tenants.length && !tenantsError ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            No tenants found.
          </Typography>
        ) : null}

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ sm: "center" }}
          gap={1.5}
          sx={{ mt: 2 }}
        >
          <Typography variant="caption" color="text.secondary">
            Page {tenantPage} of {tenantTotalPages} • {tenantTotal} tenants
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              disabled={tenantPage <= 1}
              onClick={onPreviousPage}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={tenantPage >= tenantTotalPages}
              onClick={onNextPage}
            >
              Next
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <ConfirmActionDialog
        open={Boolean(impersonationTenant)}
        title="Impersonate tenant owner"
        body="This will grant temporary access as the tenant owner. This action is logged and should only be used for active support troubleshooting."
        confirmLabel="Create link"
        confirmColor="warning"
        busy={impersonationBusy}
        onConfirm={() => void issueTenantImpersonation()}
        onCancel={() => setImpersonationTenant(null)}
      />
    </>
  );
}
