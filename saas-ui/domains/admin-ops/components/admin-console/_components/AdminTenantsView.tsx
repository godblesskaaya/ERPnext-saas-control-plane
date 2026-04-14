"use client";

import Link from "next/link";
import {
  Button,
  Chip,
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

import { buildTenantActionPhrase } from "../../../domain/adminDashboard";
import type { Tenant } from "../../../../shared/lib/types";
import { formatDate } from "./adminConsoleFormatters";

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
  busyTenantId: string | null;
  canManageTenantLifecycle?: boolean;
  onOpenTenantAction: (payload: { type: "suspend" | "unsuspend"; tenant: Tenant; phrase: string }) => void;
  tenantPage: number;
  tenantTotalPages: number;
  tenantTotal: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

function resolveStatusChipColor(status: string): "default" | "success" | "warning" | "error" | "info" {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "success";
  if (["failed", "suspended", "suspended_admin", "suspended_billing", "deleted"].includes(normalized)) return "error";
  if (["pending", "pending_payment", "provisioning", "deleting", "upgrading", "restoring", "pending_deletion"].includes(normalized))
    return "warning";
  return "info";
}

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
  busyTenantId,
  canManageTenantLifecycle = true,
  onOpenTenantAction,
  tenantPage,
  tenantTotalPages,
  tenantTotal,
  onPreviousPage,
  onNextPage,
}: AdminTenantsViewProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5} sx={{ mb: 2 }}>
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
            onChange={(event) => onTenantStatusFilterChange(event.target.value)}
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
            {tenants.map((tenant) => (
              <TableRow key={tenant.id} hover>
                <TableCell>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {tenant.company_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {tenant.domain}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
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
                  <Chip size="small" color={resolveStatusChipColor(tenant.status)} variant="outlined" label={tenant.status} />
                </TableCell>
                <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{tenant.payment_provider || "n/a"}</TableCell>
                <TableCell sx={{ fontSize: 12, color: "text.secondary" }}>{formatDate(tenant.created_at)}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button component={Link} href={`/app/tenants/${tenant.id}/overview`} size="small" variant="outlined">
                      Details
                    </Button>
                    {canManageTenantLifecycle ? (
                      ["suspended", "suspended_admin", "suspended_billing"].includes(tenant.status.toLowerCase()) ? (
                        <Button
                          type="button"
                          disabled={busyTenantId === tenant.id}
                          size="small"
                          color="success"
                          variant="contained"
                          onClick={() =>
                            onOpenTenantAction({
                              type: "unsuspend",
                              tenant,
                              phrase: buildTenantActionPhrase(tenant.subdomain),
                            })
                          }
                        >
                          {busyTenantId === tenant.id ? "Reactivating..." : "Unsuspend"}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          disabled={busyTenantId === tenant.id}
                          size="small"
                          color="warning"
                          variant="contained"
                          onClick={() =>
                            onOpenTenantAction({
                              type: "suspend",
                              tenant,
                              phrase: buildTenantActionPhrase(tenant.subdomain),
                            })
                          }
                        >
                          {busyTenantId === tenant.id ? "Suspending..." : "Suspend"}
                        </Button>
                      )
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Read-only scope
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {!tenants.length && !tenantsError ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          No tenants found.
        </Typography>
      ) : null}

      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5} sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Page {tenantPage} of {tenantTotalPages} • {tenantTotal} tenants
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" disabled={tenantPage <= 1} onClick={onPreviousPage}>
            Previous
          </Button>
          <Button size="small" variant="outlined" disabled={tenantPage >= tenantTotalPages} onClick={onNextPage}>
            Next
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
