"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";

function resolveWorkspaceLabel(pathname: string): string {
  if (pathname.startsWith("/app/admin")) return "Admin";
  if (pathname.startsWith("/app/tenants")) return "Workspaces";
  if (pathname.startsWith("/app/billing")) return "Billing";
  if (pathname.startsWith("/app/support")) return "Support";
  if (pathname.startsWith("/app/platform")) return "Platform";
  if (pathname.startsWith("/app/account")) return "Account";
  return "Overview";
}

type AppTopHeaderProps = {
  onOpenMobileNav?: () => void;
};

export function AppTopHeader({ onOpenMobileNav }: AppTopHeaderProps) {
  const pathname = usePathname() ?? "/";
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const workspaceLabel = useMemo(() => resolveWorkspaceLabel(pathname), [pathname]);
  const isMenuOpen = Boolean(menuAnchor);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 60, md: 64 }, display: "flex", gap: { xs: 1, md: 2 }, px: { xs: 1.5, sm: 2.5 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
          {onOpenMobileNav ? (
            <IconButton
              size="small"
              color="inherit"
              onClick={onOpenMobileNav}
              aria-label="Open navigation menu"
              sx={{ display: { xs: "inline-flex", lg: "none" } }}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          ) : null}
          <Box
            component={Link}
            href="/app/overview"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              textDecoration: "none",
              color: "text.primary",
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1.25,
                bgcolor: "primary.main",
                display: "grid",
                placeItems: "center",
                color: "common.white",
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              BC
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                Biashara Cloud
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "inline" } }}>
                {workspaceLabel}
              </Typography>
            </Box>
          </Box>
        </Stack>

        <IconButton
          size="small"
          color="inherit"
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          aria-label="Open account menu"
        >
          <Avatar sx={{ width: 30, height: 30, bgcolor: "primary.main" }}>
            <AccountCircleOutlinedIcon sx={{ fontSize: 18 }} />
          </Avatar>
        </IconButton>
      </Toolbar>

      <Menu
        open={isMenuOpen}
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem component={Link} href="/app/account/profile" onClick={() => setMenuAnchor(null)}>
          Account
        </MenuItem>
        <MenuItem component={Link} href="/app/account/settings" onClick={() => setMenuAnchor(null)}>
          Settings
        </MenuItem>
        <MenuItem component={Link} href="/login?logout=1" onClick={() => setMenuAnchor(null)}>
          Sign out
        </MenuItem>
      </Menu>
    </AppBar>
  );
}
