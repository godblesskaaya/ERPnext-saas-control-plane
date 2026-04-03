"use client";

import type { ReactNode } from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";

import { TenantSectionLinks } from "../sections";

type TenantWorkspacePageLayoutProps = {
  tenantId: string;
  title: string;
  tenantContext: string;
  children: ReactNode;
  footerError?: string | null;
};

export function TenantWorkspacePageLayout({
  tenantId,
  title,
  tenantContext,
  children,
  footerError,
}: TenantWorkspacePageLayoutProps) {
  return (
    <Box sx={{ display: "grid", gap: 3, pb: 4 }}>
      <Stack spacing={0.5}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tenantContext}
        </Typography>
      </Stack>

      <TenantSectionLinks tenantId={tenantId} />

      {children}

      {footerError ? <Alert severity="error">{footerError}</Alert> : null}
    </Box>
  );
}
