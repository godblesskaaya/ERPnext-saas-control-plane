"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";

type HealthValue = "checking" | "ok" | "unsupported" | "unavailable";

function chipColor(value: HealthValue): "default" | "success" | "warning" | "error" {
  if (value === "ok") return "success";
  if (value === "unsupported") return "warning";
  if (value === "unavailable") return "error";
  return "default";
}

function toHealthFromResponse(response: Response): HealthValue {
  if (response.ok) return "ok";
  if (response.status === 404 || response.status === 501) return "unsupported";
  return "unavailable";
}

export function StatusStrip() {
  const [apiStatus, setApiStatus] = useState<HealthValue>("checking");
  const [authStatus, setAuthStatus] = useState<HealthValue>("checking");
  const [billingStatus, setBillingStatus] = useState<HealthValue>("checking");

  const environment = useMemo(() => process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development", []);
  const version = useMemo(() => process.env.NEXT_PUBLIC_APP_VERSION ?? "dev", []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!active) return;
        setApiStatus(response.ok ? "ok" : "unavailable");
      } catch {
        if (!active) return;
        setApiStatus("unavailable");
      }
    })();

    void (async () => {
      try {
        const [authResponse, billingResponse] = await Promise.allSettled([
          fetch("/api/auth/health", { cache: "no-store" }),
          fetch("/api/billing/health", { cache: "no-store" }),
        ]);
        if (!active) return;
        setAuthStatus(authResponse.status === "fulfilled" ? toHealthFromResponse(authResponse.value) : "unavailable");
        setBillingStatus(billingResponse.status === "fulfilled" ? toHealthFromResponse(billingResponse.value) : "unavailable");
      } catch {
        if (!active) return;
        setAuthStatus("unavailable");
        setBillingStatus("unavailable");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

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
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
      >
        <Typography variant="caption" color="text.secondary">
          Biashara Cloud · {environment} · v{version}
        </Typography>

        <Stack direction="row" spacing={0.75} flexWrap="wrap">
          <Chip size="small" variant="outlined" color={chipColor(apiStatus)} label={`API ${apiStatus}`} />
          <Chip size="small" variant="outlined" color={chipColor(authStatus)} label={`Auth ${authStatus}`} />
          <Chip size="small" variant="outlined" color={chipColor(billingStatus)} label={`Billing ${billingStatus}`} />
        </Stack>
      </Stack>
    </Box>
  );
}
