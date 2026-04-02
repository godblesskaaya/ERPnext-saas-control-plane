"use client";

import { Button, Paper, Stack } from "@mui/material";

type TenantSectionLinksProps = {
  tenantId: string;
};

type SectionRoute = {
  route: string | null;
  label: string;
};

const sectionRoutes: SectionRoute[] = [
  { route: null, label: "Overview" },
  { route: "billing", label: "Subscription" },
  { route: "jobs", label: "Jobs" },
  { route: "backups", label: "Backups" },
  { route: "domains", label: "Domains" },
  { route: "members", label: "Team" },
  { route: "audit", label: "Activity log" },
  { route: "support", label: "Support notes" },
];

export function TenantSectionLinks({ tenantId }: TenantSectionLinksProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {sectionRoutes.map(({ route, label }) => (
          <Button
            key={label}
            component="a"
            href={route ? `/tenants/${tenantId}/${route}` : `/tenants/${tenantId}`}
            variant="outlined"
            size="small"
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}
