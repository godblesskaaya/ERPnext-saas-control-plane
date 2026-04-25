"use client";

import { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";

export function AppFooter() {
  const version = useMemo(() => process.env.NEXT_PUBLIC_APP_VERSION ?? "", []);
  const year = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        px: { xs: 2, md: 3 },
        py: 1.25,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
      >
        <Typography variant="caption" color="text.secondary">
          © {year} Biashara Cloud{version ? ` · v${version}` : ""}
        </Typography>
      </Stack>
    </Box>
  );
}
