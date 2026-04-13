"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";

import { isExactOrChildPath, isTenantOverviewPath } from "./routeCompatibility";

type TenantEntityNavProps = {
  id: string;
};

type TenantNavItem = {
  label: string;
  href: string;
  active: boolean;
};

export function TenantEntityNav({ id }: TenantEntityNavProps) {
  const pathname = usePathname() ?? "";
  const basePath = `/app/tenants/${id}`;
  const navItems: TenantNavItem[] = [
    {
      label: "Overview",
      href: `${basePath}/overview`,
      active: isTenantOverviewPath(pathname, id),
    },
    { label: "Members", href: `${basePath}/members`, active: isExactOrChildPath(pathname, `${basePath}/members`) },
    { label: "Domains", href: `${basePath}/domains`, active: isExactOrChildPath(pathname, `${basePath}/domains`) },
    { label: "Billing", href: `${basePath}/billing`, active: isExactOrChildPath(pathname, `${basePath}/billing`) },
    { label: "Jobs", href: `${basePath}/jobs`, active: isExactOrChildPath(pathname, `${basePath}/jobs`) },
    { label: "Audit", href: `${basePath}/audit`, active: isExactOrChildPath(pathname, `${basePath}/audit`) },
    { label: "Backups", href: `${basePath}/backups`, active: isExactOrChildPath(pathname, `${basePath}/backups`) },
    { label: "Support", href: `${basePath}/support`, active: isExactOrChildPath(pathname, `${basePath}/support`) },
  ];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 3,
        backgroundColor: "background.paper",
      }}
    >
      <Stack spacing={1.25}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700 }}>
          Tenant navigation
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {navItems.map((item) => (
            <Button
              key={item.label}
              component={NextLink}
              href={item.href}
              size="small"
              variant={item.active ? "contained" : "outlined"}
              color={item.active ? "warning" : "inherit"}
              aria-current={item.active ? "page" : undefined}
              sx={{
                borderRadius: 99,
                textTransform: "none",
                fontWeight: 700,
                minWidth: 0,
              }}
            >
              {item.label}
            </Button>
          ))}
        </Box>
      </Stack>
    </Paper>
  );
}
