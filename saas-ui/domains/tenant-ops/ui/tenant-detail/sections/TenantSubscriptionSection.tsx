"use client";

import { Alert, Box, Button, Card, CardContent, Chip, Paper, Stack, Typography } from "@mui/material";

import type { TenantSubscription } from "../../../../shared/lib/types";

type TenantSubscriptionSectionProps = {
  subscriptionError: string | null;
  subscriptionSupported: boolean;
  subscription: TenantSubscription | null;
  onRefresh: () => void;
  formatTimestamp: (value?: string | null) => string;
};

export function TenantSubscriptionSection({
  subscriptionError,
  subscriptionSupported,
  subscription,
  onRefresh,
  formatTimestamp,
}: TenantSubscriptionSectionProps) {
  return (
    <Paper id="subscription" variant="outlined" sx={{ p: 3, borderRadius: 4, borderColor: "warning.light", backgroundColor: "background.paper" }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          Subscription details
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={onRefresh}
          sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
        >
          Refresh
        </Button>
      </Stack>

      {subscriptionError ? <Alert severity="error" sx={{ mt: 2 }}>{subscriptionError}</Alert> : null}

      {!subscriptionSupported ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Subscription endpoint is not available on this backend deployment yet.
        </Alert>
      ) : subscription ? (
        <Box sx={{ mt: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))", lg: "repeat(3, minmax(0,1fr))" } }}>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Plan</Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>{subscription.plan.display_name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Isolation: {subscription.plan.isolation_model}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Status</Typography>
              <Chip label={subscription.status} size="small" sx={{ mt: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Provider: {subscription.payment_provider ?? "—"}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                Billing period
              </Typography>
              <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.primary" }}>
                {formatTimestamp(subscription.current_period_start)} → {formatTimestamp(subscription.current_period_end)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Next renewal: {formatTimestamp(subscription.current_period_end)}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Selected app</Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>{subscription.selected_app ?? "—"}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Support: {subscription.plan.support_channel}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Trial ends</Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>{formatTimestamp(subscription.trial_ends_at)}</Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>Cancelled at</Typography>
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 700 }}>{formatTimestamp(subscription.cancelled_at)}</Typography>
            </CardContent>
          </Card>
        </Box>
      ) : (
        <Alert severity="info" sx={{ mt: 2 }}>
          Loading subscription details...
        </Alert>
      )}
    </Paper>
  );
}
