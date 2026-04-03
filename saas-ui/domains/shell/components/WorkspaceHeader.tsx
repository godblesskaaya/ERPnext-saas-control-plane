"use client";

import type { ReactNode } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";

type WorkspaceHeaderProps = {
  overline: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function WorkspaceHeader({ overline, title, subtitle, actions }: WorkspaceHeaderProps) {
  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "divider" }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 0.8 }}>
            {overline}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? <Stack direction="row" spacing={1} flexWrap="wrap">{actions}</Stack> : null}
      </Stack>
    </Paper>
  );
}
