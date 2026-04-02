"use client";

import type { ReactNode } from "react";
import { Paper, Stack } from "@mui/material";

type ContextRailProps = {
  children: ReactNode;
};

export function ContextRail({ children }: ContextRailProps) {
  return (
    <Paper
      component="aside"
      variant="outlined"
      sx={{
        position: "sticky",
        top: 96,
        alignSelf: "flex-start",
        borderRadius: 3,
        p: 2,
      }}
    >
      <Stack spacing={2}>{children}</Stack>
    </Paper>
  );
}
