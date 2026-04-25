"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, Paper } from "@mui/material";

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
  const basePath = `/app/tenants/${tenantId}`;
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
    <Paper
      variant="outlined"
      sx={{
        p: 1,
        borderRadius: 3,
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Box
        role="tablist"
        sx={{
          display: "flex",
          gap: 1,
          overflowX: "auto",
          overflowY: "hidden",
          flexWrap: "nowrap",
          // Hide scrollbar visuals while keeping scroll behaviour
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {navItems.map(({ href, label, active }) => (
          <Button
            key={label}
            component={NextLink}
            href={href}
            variant={active ? "contained" : "text"}
            color={active ? "primary" : "inherit"}
            aria-current={active ? "page" : undefined}
            role="tab"
            size="small"
            sx={{
              borderRadius: 99,
              textTransform: "none",
              fontWeight: active ? 700 : 600,
              minWidth: 0,
              flexShrink: 0,
              whiteSpace: "nowrap",
              px: 2,
            }}
          >
            {label}
          </Button>
        ))}
      </Box>
    </Paper>
  );
}
