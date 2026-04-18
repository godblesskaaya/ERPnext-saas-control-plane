"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  createTenantDomain,
  deleteTenantDomain,
  loadTenantDomains,
  toTenantDetailErrorMessage,
  verifyTenantDomain,
} from "../../../../../../domains/tenant-ops/application/tenantDetailUseCases";
import { blockedActionReason, isTenantBillingBlocked } from "../../../../../../domains/tenant-ops/domain/lifecycleGates";
import { TenantWorkspacePageLayout } from "../../../../../../domains/tenant-ops/ui/tenant-detail/components/TenantWorkspacePageLayout";
import { useTenantRouteContext } from "../../../../../../domains/tenant-ops/ui/tenant-detail/hooks/useTenantSectionData";
import type { DomainMapping } from "../../../../../../domains/shared/lib/types";

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function TenantDomainsPage() {
  const params = useParams<{ tenantId: string }>();
  const id = params.tenantId;
  const { tenant, error } = useTenantRouteContext(id);

  const [domains, setDomains] = useState<DomainMapping[]>([]);
  const [domainsSupported, setDomainsSupported] = useState(true);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [domainInput, setDomainInput] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);
  const [removingDomainId, setRemovingDomainId] = useState<string | null>(null);
  const billingBlocked = isTenantBillingBlocked(tenant);

  const loadDomainsData = useCallback(async () => {
    if (!id) return;
    setDomainsLoading(true);
    try {
      const result = await loadTenantDomains(id);
      if (!result.supported) {
        setDomainsSupported(false);
        setDomains([]);
        setDomainsError(null);
        return;
      }
      setDomainsSupported(true);
      setDomains(result.data);
      setDomainsError(null);
    } catch (err) {
      setDomainsError(toTenantDetailErrorMessage(err, "Failed to load custom domains"));
    } finally {
      setDomainsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDomainsData();
  }, [loadDomainsData]);

  if (!id) {
    return <Alert severity="error">Tenant id is missing from route.</Alert>;
  }

  return (
    <TenantWorkspacePageLayout
      tenantId={id}
      title="Custom domains"
      tenantContext={tenant ? `${tenant.company_name} (${tenant.domain})` : "Loading tenant context..."}
      footerError={error}
    >
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider", backgroundColor: "background.paper" }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
            Domain mappings
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void loadDomainsData();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
          Add a branded domain. Point a CNAME record at{" "}
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
            {tenant?.domain ?? "your-tenant-domain"}
          </Box>
          , then verify once DNS has propagated.
        </Typography>
        {billingBlocked ? <Alert severity="warning" sx={{ mb: 2 }}>{blockedActionReason("Custom domain updates")}</Alert> : null}

        {domainsLoading ? (
          <Alert severity="info">Loading custom domains...</Alert>
        ) : !domainsSupported ? (
          <Alert severity="warning">Custom domain management is not available on this backend yet.</Alert>
        ) : domainsError ? (
          <Alert severity="error">{domainsError}</Alert>
        ) : (
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Add custom domain
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    placeholder="e.g. erp.example.com"
                    value={domainInput}
                    onChange={(event) => setDomainInput(event.target.value)}
                    size="small"
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    color="success"
                    disabled={billingBlocked || addingDomain || !domainInput.trim()}
                    onClick={async () => {
                      if (!id) return;
                      setAddingDomain(true);
                      setDomainsError(null);
                      try {
                        const result = await createTenantDomain(id, domainInput.trim());
                        if (!result.supported) {
                          setDomainsError("Custom domain endpoint is not available on this backend.");
                          return;
                        }
                        setDomainInput("");
                        await loadDomainsData();
                      } catch (err) {
                        setDomainsError(toTenantDetailErrorMessage(err, "Failed to add domain"));
                      } finally {
                        setAddingDomain(false);
                      }
                    }}
                    sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                  >
                    {addingDomain ? "Adding..." : "Add domain"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "grey.50" }}>
                  <TableRow>
                    <TableCell>Domain</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Added</TableCell>
                    <TableCell>Verified</TableCell>
                    <TableCell>Token</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {domains.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary">
                          No custom domains added yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    domains.map((domain) => (
                      <TableRow key={domain.id}>
                        <TableCell>{domain.domain}</TableCell>
                        <TableCell>
                          <Chip label={domain.status} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>{formatTimestamp(domain.created_at)}</TableCell>
                        <TableCell>{formatTimestamp(domain.verified_at)}</TableCell>
                        <TableCell>{domain.verification_token}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Button
                              variant="outlined"
                              color="success"
                              size="small"
                              disabled={billingBlocked || domain.status === "verified" || verifyingDomainId === domain.id}
                              onClick={async () => {
                                if (!id) return;
                                setVerifyingDomainId(domain.id);
                                setDomainsError(null);
                                try {
                                  const result = await verifyTenantDomain(id, domain.id, domain.verification_token);
                                  if (!result.supported) {
                                    setDomainsError("Domain verification endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadDomainsData();
                                } catch (err) {
                                  setDomainsError(toTenantDetailErrorMessage(err, "Failed to verify domain"));
                                } finally {
                                  setVerifyingDomainId(null);
                                }
                              }}
                              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                            >
                              {verifyingDomainId === domain.id ? "Verifying..." : "Verify"}
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              disabled={billingBlocked || removingDomainId === domain.id}
                              onClick={async () => {
                                if (!id) return;
                                setRemovingDomainId(domain.id);
                                setDomainsError(null);
                                try {
                                  const result = await deleteTenantDomain(id, domain.id);
                                  if (!result.supported) {
                                    setDomainsError("Domain removal endpoint is not available on this backend.");
                                    return;
                                  }
                                  await loadDomainsData();
                                } catch (err) {
                                  setDomainsError(toTenantDetailErrorMessage(err, "Failed to remove domain"));
                                } finally {
                                  setRemovingDomainId(null);
                                }
                              }}
                              sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                            >
                              {removingDomainId === domain.id ? "Removing..." : "Remove"}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </Paper>

    </TenantWorkspacePageLayout>
  );
}
