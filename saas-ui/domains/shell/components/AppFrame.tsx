"use client";

import type { ReactNode } from "react";
import { Box, Container } from "@mui/material";

import { AppTopHeader } from "./AppTopHeader";
import { StatusStrip } from "./StatusStrip";

type AppFrameProps = {
  sidebar: ReactNode;
  children: ReactNode;
  contextRail?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
};

export function AppFrame({ sidebar, children, contextRail, header, footer }: AppFrameProps) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
      {header ?? <AppTopHeader />}
      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gap: 2.5,
            gridTemplateColumns: contextRail ? { xs: "1fr", lg: "240px minmax(0,1fr) 300px" } : { xs: "1fr", lg: "240px minmax(0,1fr)" },
            alignItems: "start",
          }}
        >
          {sidebar}
          <Box sx={{ display: "grid", gap: 2.5 }}>{children}</Box>
          {contextRail ?? null}
        </Box>
      </Container>
      {footer ?? <StatusStrip />}
    </Box>
  );
}
