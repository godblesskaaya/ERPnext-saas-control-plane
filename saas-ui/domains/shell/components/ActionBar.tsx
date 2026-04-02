"use client";

import type { ReactNode } from "react";
import { Paper, Stack } from "@mui/material";

type ActionBarProps = {
  children: ReactNode;
};

export function ActionBar({ children }: ActionBarProps) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 1.5 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {children}
      </Stack>
    </Paper>
  );
}
