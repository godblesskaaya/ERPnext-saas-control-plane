"use client";

import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

import { Breadcrumbs } from "./Breadcrumbs";

type PageHeaderCrumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  overline?: string;
  breadcrumbs?: PageHeaderCrumb[];
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, overline, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <Stack spacing={1.25}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
      <Box>
        {overline ? (
          <Typography variant="overline" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: 0.7 }}>
            {overline}
          </Typography>
        ) : null}
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ?? null}
    </Stack>
    </Stack>
  );
}
