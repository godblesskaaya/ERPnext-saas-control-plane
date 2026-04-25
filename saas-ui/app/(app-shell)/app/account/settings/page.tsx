"use client";

import NextLink from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  loadAccountNotificationPreferences,
  loadAccountProfile,
  saveAccountNotificationPreferences,
  saveAccountPhone,
  toAccountErrorMessage,
} from "../../../../../domains/account/application/accountUseCases";
import {
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
} from "../../../../../domains/account/domain/settingsPreferences";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../../../../../domains/shell/components";
import type { UserProfile } from "../../../../../domains/shared/lib/types";

const preferenceOptions: Array<{ key: keyof NotificationPreferences; label: string; description: string }> = [
  { key: "emailAlerts", label: "General email", description: "Account-level updates and announcements." },
  { key: "smsAlerts", label: "SMS alerts", description: "Urgent payment and provisioning issues." },
  { key: "billingAlerts", label: "Billing", description: "Invoices, payment retries, and trial status." },
  { key: "provisioningAlerts", label: "Provisioning", description: "Workspace setup, backups, and restores." },
  { key: "supportAlerts", label: "Support", description: "Replies and updates on support requests." },
];

export default function DashboardSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [preferencesNotice, setPreferencesNotice] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const current = await loadAccountProfile();
      setProfile(current);
      setPhoneInput(current.phone ?? "");
      setError(null);
    } catch (err) {
      setProfile(null);
      setError(toAccountErrorMessage(err, "Failed to load user settings"));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await loadAccountNotificationPreferences();
        if (!active || !result.supported) return;
        setPreferences(result.preferences);
      } catch (err) {
        if (!active) return;
        setPreferencesError(toAccountErrorMessage(err, "Failed to load notification preferences."));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const savePhone = async () => {
    setPhoneBusy(true);
    setPhoneNotice(null);
    setPhoneError(null);
    try {
      const updated = await saveAccountPhone(phoneInput);
      setProfile(updated);
      setPhoneInput(updated.phone ?? "");
      setPhoneNotice("Phone number saved.");
    } catch (err) {
      setPhoneError(toAccountErrorMessage(err, "Unable to update phone number."));
    } finally {
      setPhoneBusy(false);
    }
  };

  const savePreferences = async () => {
    setPreferencesBusy(true);
    setPreferencesError(null);
    setPreferencesNotice(null);
    try {
      const result = await saveAccountNotificationPreferences(preferences);
      setPreferences(result.preferences);
      setPreferencesNotice(
        result.supported
          ? "Notification preferences saved."
          : "Notification preferences aren’t available on your workspace yet.",
      );
      window.setTimeout(() => setPreferencesNotice(null), 2400);
    } catch (err) {
      setPreferencesError(toAccountErrorMessage(err, "Unable to save notification preferences."));
    } finally {
      setPreferencesBusy(false);
    }
  };

  const verified = profile?.email_verified ?? false;

  return (
    <Stack spacing={3}>
      <PageHeader
        overline="Account"
        title="Settings"
        subtitle="Keep your contact channels current and choose which notifications you receive."
      />

      {profileLoading ? <LoadingState label="Loading account settings…" /> : null}

      {!profileLoading && error && !profile ? (
        <ErrorState
          message={error}
          action={
            <Button variant="outlined" color="error" size="small" onClick={() => void loadProfile()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {!profileLoading && !error && !profile ? (
        <EmptyState
          title="Account profile unavailable"
          description="Settings are temporarily unavailable for this session."
          action={
            <Button variant="outlined" size="small" onClick={() => void loadProfile()}>
              Reload
            </Button>
          }
        />
      ) : null}

      {!profileLoading && profile ? (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
                  Email
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.25 }}>
                  {profile.email}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  <Chip
                    size="small"
                    label={verified ? "Verified" : "Pending verification"}
                    color={verified ? "success" : "warning"}
                    variant="outlined"
                  />
                  {!verified ? (
                    <Button component={NextLink} href="/verify-email" size="small" sx={{ textTransform: "none" }}>
                      Verify now
                    </Button>
                  ) : null}
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.6 }}>
                  Phone (SMS)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  Used for urgent payment and provisioning alerts only.
                </Typography>
              </Box>
              <TextField
                label="Phone number"
                size="small"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="+255700000000"
                helperText="Use international format (E.164)."
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={phoneBusy}
                  onClick={() => void savePhone()}
                  sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
                >
                  {phoneBusy ? "Saving…" : "Save phone"}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  disabled={phoneBusy}
                  onClick={() => setPhoneInput("")}
                  sx={{ textTransform: "none" }}
                >
                  Clear
                </Button>
              </Stack>
              {phoneNotice ? (
                <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
                  {phoneNotice}
                </Alert>
              ) : null}
              {phoneError ? (
                <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                  {phoneError}
                </Alert>
              ) : null}
            </Stack>
          </Paper>
        </Box>
      ) : null}

      {!profileLoading && profile ? (
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Notification preferences
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Choose which categories of alerts to receive. Settings are saved to your account and apply across devices.
              </Typography>
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              }}
            >
              {preferenceOptions.map((option) => (
                <Card key={option.key} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
                    <FormControlLabel
                      sx={{ alignItems: "flex-start", m: 0 }}
                      control={
                        <Checkbox
                          sx={{ mt: -0.5 }}
                          checked={Boolean(preferences[option.key])}
                          onChange={(event) =>
                            setPreferences((current) => ({
                              ...current,
                              [option.key]: event.target.checked,
                            }))
                          }
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {option.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {option.description}
                          </Typography>
                        </Box>
                      }
                    />
                  </CardContent>
                </Card>
              ))}
            </Box>

            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
              <Button
                variant="contained"
                size="small"
                disabled={preferencesBusy}
                onClick={() => void savePreferences()}
                sx={{ borderRadius: 99, textTransform: "none", fontWeight: 700 }}
              >
                {preferencesBusy ? "Saving…" : "Save preferences"}
              </Button>
              {preferencesNotice ? (
                <Typography variant="caption" color="success.main">
                  {preferencesNotice}
                </Typography>
              ) : null}
              {preferencesError ? (
                <Typography variant="caption" color="error.main">
                  {preferencesError}
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
