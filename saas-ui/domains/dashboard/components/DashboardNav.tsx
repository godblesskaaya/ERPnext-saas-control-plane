"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Divider, List, ListItemButton, ListItemText, Paper, Stack, Typography } from "@mui/material";

import { getDashboardNavSectionsByMode, type DashboardNavItem } from "../domain/navigation";

function isActiveRoute(pathname: string, item: DashboardNavItem): boolean {
  const matchers = [item.href, ...(item.match ?? [])];
  return matchers.some((matcher) => pathname === matcher || pathname.startsWith(`${matcher}/`));
}

const workspaceSections = getDashboardNavSectionsByMode("workspace");
const keyWorkspaceRoutes = new Set([
  "/dashboard/overview",
  "/dashboard/registry",
  "/dashboard/active",
  "/dashboard/onboarding",
  "/dashboard/provisioning",
  "/dashboard/incidents",
  "/dashboard/suspensions",
  "/dashboard/support",
  "/dashboard/billing-ops",
  "/billing",
  "/dashboard/billing-details",
  "/dashboard/account",
  "/dashboard/settings",
]);

const keyFeatureWorkspaceSections = workspaceSections
  .map((section) => ({
    ...section,
    items: section.items.filter((item) => keyWorkspaceRoutes.has(item.href) && !item.href.startsWith("/admin")),
  }))
  .filter((section) => section.items.length > 0);

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <Paper
      component="aside"
      elevation={1}
      sx={{
        position: "sticky",
        top: 96,
        alignSelf: "flex-start",
        p: 2.25,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "rgba(255,255,255,0.88)",
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: 0.7 }}>
            User Workspace
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Workspace navigation
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Customer-facing routes only: queues, tenants, billing, account, and settings.
          </Typography>
        </Box>

        <Divider />

        {keyFeatureWorkspaceSections.map((section) => (
          <Box key={section.title}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "text.secondary" }}>
              {section.title}
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
              {section.description}
            </Typography>
            <List dense disablePadding>
              {section.items.map((item) => {
                const active = isActiveRoute(pathname, item);
                return (
                  <ListItemButton
                    key={item.href}
                    component={Link}
                    href={item.href}
                    selected={active}
                    sx={{
                      borderRadius: 2,
                      mb: 0.5,
                      border: "1px solid",
                      borderColor: active ? "primary.light" : "divider",
                      bgcolor: active ? "rgba(13,106,106,0.08)" : "background.paper",
                      "&:hover": { bgcolor: "rgba(245,158,11,0.1)" },
                    }}
                  >
                    <ListItemText
                      primary={item.label}
                      secondary={item.hint}
                      primaryTypographyProps={{ fontSize: 13.5, fontWeight: 700, color: active ? "primary.main" : "text.primary" }}
                      secondaryTypographyProps={{ fontSize: 11.5, color: "text.secondary" }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
