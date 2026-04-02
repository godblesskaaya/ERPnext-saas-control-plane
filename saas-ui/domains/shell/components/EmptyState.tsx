"use client";

import type { ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, p: 3, textAlign: "center" }}>
      <Stack spacing={1.5} alignItems="center">
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
          {description}
        </Typography>
        {action ?? null}
      </Stack>
    </Paper>
  );
}
