"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Box, Divider, List, ListItemButton, ListItemText, Paper, Stack, Typography } from "@mui/material";

import { adminNavSections } from "../domain/adminNavigation";

type SearchParamsReader = Pick<URLSearchParams, "get">;

function isNavItemActive(href: string, pathname: string, searchParams: SearchParamsReader): boolean {
  const [targetPath, targetQuery = ""] = href.split("?");

  if (!targetQuery) {
    return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
  }

  if (pathname !== targetPath) {
    return false;
  }

  const targetParams = new URLSearchParams(targetQuery);
  for (const [key, value] of targetParams.entries()) {
    const currentValue = searchParams.get(key);
    if (currentValue === value) {
      continue;
    }

    const isAdminOverviewFallback =
      targetPath === "/admin" && key === "view" && value === "overview" && (currentValue === null || currentValue === "");

    if (!isAdminOverviewFallback) {
      return false;
    }
  }

  return true;
}

export function AdminNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
        bgcolor: "rgba(2,6,23,0.92)",
        color: "grey.100",
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" sx={{ fontWeight: 700, color: "warning.light", letterSpacing: 0.7 }}>
            Admin Shell
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "common.white" }}>
            Platform command
          </Typography>
          <Typography variant="caption" sx={{ color: "grey.400" }}>
            Privileged features only.
          </Typography>
        </Box>

        <Divider sx={{ borderColor: "rgba(148,163,184,0.28)" }} />

        {adminNavSections.map((section) => (
          <Box key={section.title}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", color: "grey.400" }}>
              {section.title}
            </Typography>
            <Typography variant="caption" display="block" sx={{ color: "grey.500", mb: 1 }}>
              {section.description}
            </Typography>
            <List dense disablePadding>
              {section.items.map((item) => {
                const active = isNavItemActive(item.href, pathname, searchParams);
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
                      borderColor: active ? "warning.main" : "rgba(100,116,139,0.4)",
                      bgcolor: active ? "rgba(245,158,11,0.14)" : "rgba(15,23,42,0.75)",
                      "&:hover": { bgcolor: "rgba(51,65,85,0.75)" },
                    }}
                  >
                    <ListItemText
                      primary={item.label}
                      secondary={item.hint}
                      primaryTypographyProps={{ fontSize: 13.5, fontWeight: 700, color: active ? "warning.light" : "grey.100" }}
                      secondaryTypographyProps={{ fontSize: 11.5, color: "grey.500" }}
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

