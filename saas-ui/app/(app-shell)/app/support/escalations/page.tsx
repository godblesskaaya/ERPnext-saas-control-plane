"use client";

import NextLink from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import { PageHeader } from "../../../../../domains/shell/components";

const ESCALATION_TRIGGERS = [
  "Login still fails after verifying your email and resetting your password.",
  "A payment succeeded but your workspace is still restricted or suspended.",
  "The same error affects multiple users, branches, or workspaces.",
  "Data looks incorrect, missing, or unexpectedly changed.",
];

const REQUEST_CHECKLIST = [
  "Workspace name and subdomain.",
  "When the problem started, in your local time.",
  "The user account affected.",
  "Steps you took before the error.",
  "A screenshot if possible.",
];

export default function SupportOverviewPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Support"
        title="Get help"
        subtitle="Choose the right channel and include the details that speed up resolution."
      />

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ display: "grid", gap: 1.5, p: 3 }}>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
              Where to start
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Open the support queue
            </Typography>
            <Typography variant="body2" color="text.secondary">
              For most questions, the support queue is the fastest path. Urgent issues, payment blockers, and broken
              sign-ins are prioritised first.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                component={NextLink}
                href="/app/support/queue"
                variant="contained"
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
              >
                Open support queue
              </Button>
              <Button
                component={NextLink}
                href="/app/account/settings"
                variant="outlined"
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
              >
                Update contact details
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ display: "grid", gap: 1.5, p: 3 }}>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
              What to include
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Help us help you faster
            </Typography>
            <List dense disablePadding>
              {REQUEST_CHECKLIST.map((item) => (
                <ListItem key={item} disableGutters sx={{ alignItems: "flex-start", py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 28, mt: 0.25 }}>
                    <CheckCircleOutlineIcon fontSize="small" color="success" />
                  </ListItemIcon>
                  <ListItemText primaryTypographyProps={{ variant: "body2" }} primary={item} />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              When to escalate
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              If any of these apply, mark the request as urgent so we can prioritise it.
            </Typography>
          </Box>
          <List disablePadding>
            {ESCALATION_TRIGGERS.map((trigger) => (
              <ListItem key={trigger} disableGutters sx={{ alignItems: "flex-start", py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28, mt: 0.25 }}>
                  <WarningAmberOutlinedIcon fontSize="small" color="warning" />
                </ListItemIcon>
                <ListItemText primaryTypographyProps={{ variant: "body2" }} primary={trigger} />
              </ListItem>
            ))}
          </List>
        </Stack>
      </Paper>

      <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
        For payment problems, the billing portal often resolves things directly — try{" "}
        <Box
          component={NextLink}
          href="/app/billing/invoices"
          sx={{ color: "primary.main", fontWeight: 600, textDecoration: "none" }}
        >
          Billing → Invoices
        </Box>{" "}
        first.
      </Alert>
    </Stack>
  );
}
