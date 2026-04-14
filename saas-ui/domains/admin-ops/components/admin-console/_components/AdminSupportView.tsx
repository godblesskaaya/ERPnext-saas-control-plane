"use client";

import { Alert, Button, Grid, Paper, Stack, TextField, Typography } from "@mui/material";

type AdminSupportViewProps = {
  impersonationEmail: string;
  onImpersonationEmailChange: (value: string) => void;
  impersonationReason: string;
  onImpersonationReasonChange: (value: string) => void;
  impersonationBusy: boolean;
  canIssueImpersonationLink?: boolean;
  onIssueImpersonationLink: () => void;
  impersonationError: string | null;
  impersonationLink: string | null;
  impersonationToken: string | null;
};

export function AdminSupportView({
  impersonationEmail,
  onImpersonationEmailChange,
  impersonationReason,
  onImpersonationReasonChange,
  impersonationBusy,
  canIssueImpersonationLink = true,
  onIssueImpersonationLink,
  impersonationError,
  impersonationLink,
  impersonationToken,
}: AdminSupportViewProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Support impersonation links
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Short-lived, audited access for guided troubleshooting.
        </Typography>
      </Stack>
      <Grid container spacing={1.5} alignItems="center">
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="target-user@example.com"
            value={impersonationEmail}
            onChange={(event) => onImpersonationEmailChange(event.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Reason for support access"
            value={impersonationReason}
            onChange={(event) => onImpersonationReasonChange(event.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Button
            fullWidth
            size="small"
            variant="outlined"
            onClick={onIssueImpersonationLink}
            disabled={impersonationBusy || !canIssueImpersonationLink}
          >
            {impersonationBusy ? "Issuing..." : canIssueImpersonationLink ? "Issue link" : "Admin only"}
          </Button>
        </Grid>
      </Grid>
      {!canIssueImpersonationLink ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
          Support role is read-only for impersonation. Ask an admin to issue links.
        </Typography>
      ) : null}
      {impersonationError ? (
        <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
          {impersonationError}
        </Typography>
      ) : null}
      {impersonationLink ? (
        <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Impersonation link ready
          </Typography>
          <Typography variant="caption" sx={{ wordBreak: "break-all", display: "block", mt: 0.5 }}>
            {impersonationLink}
          </Typography>
          {impersonationToken ? (
            <Typography variant="caption" sx={{ wordBreak: "break-all", display: "block", mt: 0.5 }}>
              Token: {impersonationToken}
            </Typography>
          ) : null}
        </Alert>
      ) : null}
    </Paper>
  );
}
