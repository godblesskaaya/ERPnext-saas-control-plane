"use client";

import { Box, CircularProgress, Typography } from "@mui/material";

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading..." }: LoadingStateProps) {
  return (
    <Box
      sx={{
        minHeight: 220,
        display: "grid",
        placeItems: "center",
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 3,
      }}
    >
      <Box sx={{ display: "grid", gap: 1, placeItems: "center" }}>
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
    </Box>
  );
}
