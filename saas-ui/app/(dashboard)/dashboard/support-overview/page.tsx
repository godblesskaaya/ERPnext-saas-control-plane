"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Box, Button, Card, CardContent, Chip, Grid, Link, Paper, Stack, Typography } from "@mui/material";

import { loadAuthHealthSnapshot, type ServiceHealth } from "../../../../domains/auth/application/authUseCases";

function toneForStatus(status: ServiceHealth["status"]): "success" | "warning" | "error" | "default" {
  if (status === "ok") return "success";
  if (status === "unsupported") return "warning";
  if (status === "unavailable") return "error";
  return "default";
}

function healthLabel(health: ServiceHealth): string {
  return health.status === "ok" ? health.message || "ok" : health.status;
}

function SupportCard({
  title,
  eyebrow,
  body,
  actions,
}: {
  title: string;
  eyebrow: string;
  body: string;
  actions?: Array<{ label: string; href: string; variant?: "contained" | "outlined" }>;
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "warning.light", height: "100%" }}>
      <CardContent>
        <Typography variant="overline" sx={{ color: "warning.dark", letterSpacing: 0.8, fontWeight: 700 }}>
          {eyebrow}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.25 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {body}
        </Typography>
        {actions ? (
          <Stack spacing={1} sx={{ mt: 2 }}>
            {actions.map((action) => (
              <Button key={action.label} href={action.href} variant={action.variant ?? "outlined"} color="inherit" sx={{ borderRadius: 999 }}>
                {action.label}
              </Button>
            ))}
          </Stack>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function SupportOverviewPage() {
  const [authHealth, setAuthHealth] = useState<ServiceHealth>({ status: "checking", message: "checking" });
  const [billingHealth, setBillingHealth] = useState<ServiceHealth>({ status: "checking", message: "checking" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await loadAuthHealthSnapshot();
      setAuthHealth(snapshot.auth);
      setBillingHealth(snapshot.billing);
    } catch {
      setError("Unable to refresh support overview right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const serviceSummary = useMemo(() => {
    if (authHealth.status === "ok" && billingHealth.status === "ok") {
      return "Account access and billing checks are currently responding.";
    }
    if (authHealth.status === "unavailable" || billingHealth.status === "unavailable") {
      return "At least one support-related check is unavailable right now.";
    }
    return "Some support-related checks are not exposed on this deployment.";
  }, [authHealth.status, billingHealth.status]);

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "warning.light" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="overline" sx={{ color: "warning.dark", fontWeight: 700, letterSpacing: 0.8 }}>
              Support overview
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
              How to get help
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Choose the right channel, set expectations early, and include the details that help us resolve issues faster.
            </Typography>
          </Box>
          <Button variant="outlined" color="warning" onClick={() => void load()} disabled={loading} sx={{ borderRadius: 999 }}>
            {loading ? "Refreshing..." : "Refresh guidance"}
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
          {error}
        </Alert>
      ) : null}

      <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
        {serviceSummary}
      </Alert>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <SupportCard
            eyebrow="Support channels"
            title="Use the channel that matches your issue"
            body="Email and in-app support are best for most requests. Use billing tools for payment issues, and keep contact settings current so urgent replies reach you."
            actions={[
              { label: "Open support queue", href: "/dashboard/support", variant: "contained" },
              { label: "Review billing", href: "/billing" },
              { label: "Update contact settings", href: "/dashboard/settings" },
            ]}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <SupportCard
            eyebrow="Response expectations"
            title="Typical support flow"
            body="Urgent outages and blocked sign-in issues are prioritized first. Billing questions and general how-to requests are handled after active incidents, usually during EAT business hours."
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <SupportCard
            eyebrow="Before you reach out"
            title="Add the details that speed resolution"
            body="Include your workspace name, the time the problem started, the user affected, and a screenshot if possible. That reduces back-and-forth and helps us escalate correctly."
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "warning.light", height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              When to escalate
            </Typography>
            <Stack spacing={1.25} sx={{ mt: 2 }}>
              {[
                "Login still fails after you verify your email and retry your password.",
                "A payment succeeded but your account still looks restricted or suspended.",
                "The same error affects many users, branches, or workspaces at once.",
                "You see data that looks incorrect, missing, or unexpectedly changed.",
              ].map((item) => (
                <Alert key={item} severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
                  {item}
                </Alert>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              If you need to follow up, share the ticket reference or screenshot in the same thread so we can keep the history together.
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper variant="outlined" sx={{ borderRadius: 4, p: 3, borderColor: "warning.light", height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Current support-related checks
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {[
                { label: "Sign-in", health: authHealth },
                { label: "Billing", health: billingHealth },
              ].map((item) => (
                <Card key={item.label} variant="outlined" sx={{ borderRadius: 2.5 }}>
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                          {item.label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {healthLabel(item.health)}
                        </Typography>
                      </Box>
                      <Chip label={item.health.status} size="small" color={toneForStatus(item.health.status)} />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Use these signals as a quick hint, then choose the matching support path above.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }} useFlexGap>
              <Link href="/verify-email" underline="hover">
                Verify email
              </Link>
              <Link href="/dashboard/settings" underline="hover">
                Contact settings
              </Link>
              <Link href="/dashboard/support" underline="hover">
                Support queue
              </Link>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
