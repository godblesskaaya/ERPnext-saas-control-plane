"use client";

import type { ReactNode } from "react";
import { Alert, type AlertProps } from "@mui/material";

type FeatureUnavailableProps = {
  /** Feature name shown to the user, e.g. "Custom domains", "Team management". */
  feature: string;
  /** Optional caller-supplied detail rendered after the standard sentence. */
  detail?: string;
  /** Optional action node (Button/Link) shown on the right side of the alert. */
  action?: ReactNode;
  /** MUI Alert severity. Defaults to "info" which is calmer than "warning". */
  severity?: AlertProps["severity"];
  /** Override the default Alert sx if needed. */
  sx?: AlertProps["sx"];
};

/**
 * Renders a consistent, user-friendly notice when a backend capability is
 * not enabled for the current workspace. Replaces the dozens of bespoke
 * "endpoint not available on this backend" alerts that leak technical
 * vocabulary into the customer surface.
 */
export function FeatureUnavailable({
  feature,
  detail,
  action,
  severity = "info",
  sx,
}: FeatureUnavailableProps) {
  return (
    <Alert severity={severity} variant="outlined" action={action} sx={{ borderRadius: 2, ...sx }}>
      {feature} isn’t available on your workspace yet.{detail ? ` ${detail}` : " Contact support if you need access."}
    </Alert>
  );
}

/**
 * String form of the same message, for use in toast/error state where a
 * full Alert component is not appropriate.
 */
export function featureUnavailableMessage(feature: string, detail?: string): string {
  const base = `${feature} isn’t available on your workspace yet.`;
  return detail ? `${base} ${detail}` : `${base} Contact support if you need access.`;
}
