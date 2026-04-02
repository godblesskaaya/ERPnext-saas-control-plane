"use client";

import Link from "next/link";
import { Breadcrumbs as MuiBreadcrumbs, Typography } from "@mui/material";

type Crumb = {
  label: string;
  href?: string;
};

type ShellBreadcrumbsProps = {
  items: Crumb[];
};

export function Breadcrumbs({ items }: ShellBreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <MuiBreadcrumbs aria-label="breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        if (!item.href || isLast) {
          return (
            <Typography key={`${item.label}-${index}`} color={isLast ? "text.primary" : "text.secondary"} variant="body2">
              {item.label}
            </Typography>
          );
        }

        return (
          <Typography
            key={`${item.label}-${index}`}
            component={Link}
            href={item.href}
            variant="body2"
            color="primary.main"
            sx={{ textDecoration: "none" }}
          >
            {item.label}
          </Typography>
        );
      })}
    </MuiBreadcrumbs>
  );
}
