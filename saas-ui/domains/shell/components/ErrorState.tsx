"use client";

import type { ReactNode } from "react";
import { Alert, Stack } from "@mui/material";

type ErrorStateProps = {
  message: string;
  action?: ReactNode;
};

export function ErrorState({ message, action }: ErrorStateProps) {
  return (
    <Stack spacing={1.5}>
      <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
        {message}
      </Alert>
      {action ?? null}
    </Stack>
  );
}
