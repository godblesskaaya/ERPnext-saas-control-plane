"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert, Box, Button, Card, CardContent, Paper, Stack, Typography } from "@mui/material";

import { PageHeader } from "../../../../domains/shell/components/PageHeader";

export type TenantDetailSection = "overview" | "members" | "domains" | "billing" | "jobs" | "audit" | "backups" | "support";

const tenantTabs: Array<{ label: string; section: TenantDetailSection }> = [
  { label: "Overview", section: "overview" },
  { label: "Members", section: "members" },
  { label: "Domains", section: "domains" },
  { label: "Billing", section: "billing" },
  { label: "Jobs", section: "jobs" },
  { label: "Audit", section: "audit" },
  { label: "Backups", section: "backups" },
  { label: "Support", section: "support" },
];

type TenantDetailScaffoldProps = {
  tenantId: string;
  section: TenantDetailSection;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function TenantDetailScaffold({ tenantId, section, title, subtitle, children }: TenantDetailScaffoldProps) {
  return (
    <Stack spacing={2.5}>
      <PageHeader
        overline="Tenant detail"
        title={title}
        subtitle={subtitle}
        breadcrumbs={[
          { label: "Overview", href: "/app/overview" },
          { label: "Tenants", href: "/app/tenants" },
          { label: tenantId },
          { label: title },
        ]}
      />

      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {tenantTabs.map((item) => {
            const active = item.section === section;
            return (
              <Button
                key={item.section}
                component={Link}
                href={`/app/tenants/${tenantId}/${item.section}`}
                variant={active ? "contained" : "outlined"}
                color={active ? "primary" : "inherit"}
                size="small"
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700, minWidth: 0 }}
              >
                {item.label}
              </Button>
            );
          })}
        </Box>
      </Paper>

      {children}
    </Stack>
  );
}

export function TenantSectionPlaceholder({ title, body, actions }: { title: string; body: string; actions?: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 4, p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {body}
        </Typography>
        {actions ? <Box>{actions}</Box> : null}
      </Stack>
    </Paper>
  );
}

export function TenantOverviewScaffold({ tenantId }: { tenantId: string }) {
  return (
    <Stack spacing={2}>
      <Card variant="outlined" sx={{ borderRadius: 4 }}>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
              Tenant workspace
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {tenantId}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Canonical tenant detail entrypoint under `/app/tenants/:tenantId/overview`.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="info" sx={{ borderRadius: 3 }}>
        AGENT-NOTE: Tenant detail content is scaffolded first to land the canonical route shape. Detailed per-tab data migration remains in the next phase.
      </Alert>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Card variant="outlined" sx={{ flex: 1, borderRadius: 4 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
              Next actions
            </Typography>
            <Stack spacing={1.25} sx={{ mt: 1.5 }}>
              {[
                ["Members", "members"],
                ["Domains", "domains"],
                ["Billing", "billing"],
                ["Jobs", "jobs"],
              ].map(([label, section]) => (
                <Button key={section} component={Link} href={`/app/tenants/${tenantId}/${section}`} variant="outlined" color="inherit" sx={{ justifyContent: "flex-start", textTransform: "none", borderRadius: 2 }}>
                  {label}
                </Button>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ flex: 1, borderRadius: 4 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.7 }}>
              Route intent
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Use this overview to orient the operator, then move into the owning tab for the task at hand.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  );
}
