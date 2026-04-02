"use client";

import type { ReactNode } from "react";
import { Box, Container } from "@mui/material";

type AppFrameProps = {
  sidebar: ReactNode;
  children: ReactNode;
  contextRail?: ReactNode;
  backgroundColor?: string;
  textColor?: string;
};

export function AppFrame({ sidebar, children, contextRail, backgroundColor = "#f8f5ef", textColor }: AppFrameProps) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: backgroundColor, color: textColor, py: { xs: 2, md: 3 } }}>
      <Container maxWidth="xl">
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: contextRail ? { xs: "1fr", lg: "280px minmax(0,1fr) 300px" } : { xs: "1fr", lg: "280px minmax(0,1fr)" },
            alignItems: "start",
          }}
        >
          {sidebar}
          <Box sx={{ display: "grid", gap: 3 }}>{children}</Box>
          {contextRail ?? null}
        </Box>
      </Container>
    </Box>
  );
}
