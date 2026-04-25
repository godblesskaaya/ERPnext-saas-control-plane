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
    <Stack spacing={1.5}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Box sx={{ minWidth: 0 }}>
          {overline ? (
            <Typography
              variant="overline"
              sx={{ fontWeight: 700, color: "primary.main", letterSpacing: 0.7, display: "block", lineHeight: 1.4 }}
            >
              {overline}
            </Typography>
          ) : null}
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? <Box sx={{ flexShrink: 0 }}>{actions}</Box> : null}
      </Stack>
    </Stack>
  );
}
