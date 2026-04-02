"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";

type TenantEntityNavProps = {
  id: string;
};

type TenantNavItem = {
  label: string;
  href: string;
  active: boolean;
};

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function isExactOrChild(pathname: string, href: string): boolean {
  const normalizedPathname = normalizePath(pathname);
  const normalizedHref = normalizePath(href);

  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}

export function TenantEntityNav({ id }: TenantEntityNavProps) {
  const pathname = usePathname() ?? "";
  const basePath = `/tenants/${id}`;
  const navItems: TenantNavItem[] = [
    {
      label: "Overview",
      href: basePath,
      active: normalizePath(pathname) === basePath || normalizePath(pathname) === `${basePath}/overview`,
    },
    { label: "Members", href: `${basePath}/members`, active: isExactOrChild(pathname, `${basePath}/members`) },
    { label: "Domains", href: `${basePath}/domains`, active: isExactOrChild(pathname, `${basePath}/domains`) },
    { label: "Billing", href: `${basePath}/billing`, active: isExactOrChild(pathname, `${basePath}/billing`) },
    { label: "Jobs", href: `${basePath}/jobs`, active: isExactOrChild(pathname, `${basePath}/jobs`) },
    { label: "Audit", href: `${basePath}/audit`, active: isExactOrChild(pathname, `${basePath}/audit`) },
    { label: "Backups", href: `${basePath}/backups`, active: isExactOrChild(pathname, `${basePath}/backups`) },
    { label: "Support", href: `${basePath}/support`, active: isExactOrChild(pathname, `${basePath}/support`) },
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
