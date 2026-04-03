"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Paper, Tab, Tabs, Typography } from "@mui/material";

import { isShellNavItemActive } from "../../shell/model/nav";
import { getWorkspaceLocalNavForPath, resolveWorkspaceKeyFromPath } from "../../shell/model/workspace";

const LOCAL_NAV_WORKSPACE_KEYS = new Set(["tenants", "billing", "support", "platform"]);

export function WorkspaceLocalNav() {
  const pathname = usePathname() ?? "/";
  const workspaceKey = resolveWorkspaceKeyFromPath(pathname);

  if (!LOCAL_NAV_WORKSPACE_KEYS.has(workspaceKey)) {
    return null;
  }

  const section = getWorkspaceLocalNavForPath(pathname);
  const activeItem = section.items.find((item) => isShellNavItemActive(pathname, item)) ?? section.items[0];
  const activeValue = activeItem?.href ?? false;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, px: 1.5, pt: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 1, pb: 0.75 }}>
        {section.title}
      </Typography>
      <Tabs
        value={activeValue}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={`${section.title} navigation`}
        sx={{
          minHeight: 40,
          "& .MuiTab-root": {
            minHeight: 40,
            px: 1.5,
            py: 0.5,
            fontSize: 13,
          },
        }}
      >
        {section.items.map((item) => (
          <Tab key={item.href} value={item.href} label={item.label} component={Link} href={item.href} />
        ))}
      </Tabs>
      {section.description ? (
        <Box sx={{ px: 1, pb: 1.25 }}>
          <Typography variant="caption" color="text.secondary">
            {section.description}
          </Typography>
        </Box>
      ) : null}
    </Paper>
  );
}

