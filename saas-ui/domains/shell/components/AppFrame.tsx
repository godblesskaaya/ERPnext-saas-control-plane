"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Box, Container, Drawer } from "@mui/material";

import { AppTopHeader } from "./AppTopHeader";
import { StatusStrip } from "./StatusStrip";

type AppFrameProps = {
  sidebar: ReactNode;
  mobileSidebar?: ReactNode;
  children: ReactNode;
  contextRail?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
};

export function AppFrame({ sidebar, mobileSidebar, children, contextRail, header, footer }: AppFrameProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openMobileNav = () => setMobileNavOpen(true);
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        overflowX: "clip",
        bgcolor: "background.default",
        color: "text.primary",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
      }}
    >
      {header ?? <AppTopHeader onOpenMobileNav={openMobileNav} />}
      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 }, width: "100%", overflowX: "hidden" }}>
        <Box
          sx={{
            display: "grid",
            gap: 2.5,
            gridTemplateColumns: contextRail ? { xs: "1fr", lg: "240px minmax(0,1fr) 300px" } : { xs: "1fr", lg: "240px minmax(0,1fr)" },
            alignItems: "start",
          }}
        >
          <Box sx={{ display: { xs: "none", lg: "block" }, minWidth: 0 }}>{sidebar}</Box>
          <Box sx={{ display: "grid", gap: 2.5, minWidth: 0, overflowX: "hidden" }}>{children}</Box>
          {contextRail ? (
            <Box sx={{ minWidth: 0, overflowX: "hidden" }}>
              {contextRail}
            </Box>
          ) : null}
        </Box>
      </Container>
      <Drawer
        anchor="left"
        open={mobileNavOpen}
        onClose={closeMobileNav}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", lg: "none" },
          "& .MuiDrawer-paper": {
            width: "min(320px, 88vw)",
            p: 1.5,
            bgcolor: "background.default",
            overflowX: "hidden",
          },
        }}
      >
        <Box role="presentation" onClick={closeMobileNav} sx={{ minWidth: 0 }}>
          {mobileSidebar ?? sidebar}
        </Box>
      </Drawer>
      {footer ?? <StatusStrip />}
    </Box>
  );
}
