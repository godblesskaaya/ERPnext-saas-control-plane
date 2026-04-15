"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppBar,
  Avatar,
  Box,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";

function resolveWorkspaceLabel(pathname: string): string {
  if (pathname.startsWith("/app/admin")) return "Admin";
  if (pathname.startsWith("/app/tenants")) return "Tenants";
  if (pathname.startsWith("/app/billing") || pathname.includes("/billing")) return "Billing";
  if (pathname.includes("/support")) return "Support";
  if (pathname.includes("/platform") || pathname.includes("/provisioning") || pathname.includes("/incidents")) return "Platform";
  if (pathname.includes("/account") || pathname.includes("/settings")) return "Account";
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
      <Toolbar sx={{ minHeight: { xs: 62, md: 64 }, display: "flex", gap: { xs: 1, md: 2 }, px: { xs: 1.25, sm: 2 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
          {onOpenMobileNav ? (
            <IconButton
              size="small"
              color="inherit"
              onClick={onOpenMobileNav}
              aria-label="Open navigation menu"
              sx={{ display: { xs: "inline-flex", md: "none" } }}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          ) : null}
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
            }}
          >
            BC
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              Biashara Cloud
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "inline" } }}>
              {workspaceLabel} workspace
            </Typography>
          </Box>
        </Stack>

        {/* AGENT-NOTE: The spec calls for optional global search. We ship a non-blocking UI slot now,
           then wire real cross-workspace query behavior in the next workflow phase. */}
        <TextField
          size="small"
          placeholder="Search tenants, invoices, jobs…"
          sx={{ display: { xs: "none", md: "block" }, minWidth: { md: 280, lg: 320 }, maxWidth: 520, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <Stack direction="row" spacing={{ xs: 0, sm: 0.5 }} alignItems="center" sx={{ ml: "auto" }}>
          <Tooltip title="Notifications">
            <IconButton size="small" color="inherit">
              <NotificationsNoneOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Help">
            {/* AGENT-NOTE: We route help to support overview as an in-product docs fallback until
               a dedicated docs center route is finalized. */}
            <IconButton size="small" color="inherit" component={Link} href="/app/support/escalations">
              <HelpOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            color="inherit"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            aria-label="Open account menu"
          >
            <Avatar sx={{ width: 26, height: 26, bgcolor: "primary.main" }}>
              <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />
            </Avatar>
          </IconButton>
        </Stack>
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
