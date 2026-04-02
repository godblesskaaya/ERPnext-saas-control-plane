"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Button, Paper, Stack } from "@mui/material";

import { isExactOrChildPath, isTenantOverviewPath } from "../routeCompatibility";

type TenantSectionLinksProps = {
  tenantId: string;
};

export type SectionRoute = {
  route: string;
  label: string;
};

const sectionRoutes: SectionRoute[] = [
  { route: "", label: "Overview" },
  { route: "billing", label: "Subscription" },
  { route: "jobs", label: "Jobs" },
  { route: "backups", label: "Backups" },
  { route: "domains", label: "Domains" },
  { route: "members", label: "Team" },
  { route: "audit", label: "Activity log" },
  { route: "support", label: "Support notes" },
];

export type TenantSectionNavItem = SectionRoute & {
  href: string;
  active: boolean;
};

export function buildTenantSectionNavItems(pathname: string, tenantId: string): TenantSectionNavItem[] {
  const basePath = `/tenants/${tenantId}`;
  return sectionRoutes.map((item) => {
    const href = item.route ? `${basePath}/${item.route}` : basePath;
    const active = item.route ? isExactOrChildPath(pathname, href) : isTenantOverviewPath(pathname, tenantId);
    return { ...item, href, active };
  });
}

export function TenantSectionLinks({ tenantId }: TenantSectionLinksProps) {
  const pathname = usePathname() ?? "";
  const navItems = buildTenantSectionNavItems(pathname, tenantId);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {navItems.map(({ href, label, active }) => (
          <Button
            key={label}
            component={NextLink}
            href={href}
            variant={active ? "contained" : "outlined"}
            color={active ? "warning" : "inherit"}
            aria-current={active ? "page" : undefined}
            size="small"
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700, minWidth: 0 }}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}
