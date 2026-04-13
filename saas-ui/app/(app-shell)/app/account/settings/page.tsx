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
  FormControlLabel,
  Grid,
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
  PREFERENCES_STORAGE_KEY,
  parsePreferences,
  type NotificationPreferences,
} from "../../../../../domains/account/domain/settingsPreferences";
import { EmptyState, ErrorState, LoadingState } from "../../../../../domains/shell/components";
import type { UserProfile } from "../../../../../domains/shared/lib/types";

const preferenceOptions: Array<{ key: keyof NotificationPreferences; label: string }> = [
  { key: "emailAlerts", label: "General email alerts" },
  { key: "smsAlerts", label: "SMS alerts" },
  { key: "billingAlerts", label: "Billing alerts" },
  { key: "provisioningAlerts", label: "Provisioning alerts" },
  { key: "supportAlerts", label: "Support alerts" },
];

export default function DashboardSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
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
        setPreferencesLoaded(true);
      } catch (err) {
        if (!active) return;
        setPreferencesError(toAccountErrorMessage(err, "Failed to load notification preferences."));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPreferences(parsePreferences(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)));
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, preferencesLoaded]);

  const savePhone = async () => {
    setPhoneBusy(true);
    setPhoneNotice(null);
    setPhoneError(null);
    try {
      const updated = await saveAccountPhone(phoneInput);
      setProfile(updated);
      setPhoneInput(updated.phone ?? "");
      setPhoneNotice("Phone contact updated.");
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
          ? "Notification preferences saved to your account."
          : "Notification preferences saved on this device."
      );
      window.setTimeout(() => setPreferencesNotice(null), 1800);
    } catch (err) {
      setPreferencesError(toAccountErrorMessage(err, "Unable to save notification preferences."));
    } finally {
      setPreferencesBusy(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ borderColor: "divider", p: 3, borderRadius: 4 }}>
        <Typography variant="overline" sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 0.8 }}>
          Settings
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
          Notification and contact readiness
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Keep your contact channels ready so billing and provisioning alerts reach your team quickly.
        </Typography>
      </Paper>

      <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
        You are in Dashboard → Settings. Keep contact channels current first, then confirm notification preferences for billing, provisioning, and support.
      </Alert>

      {profileLoading ? <LoadingState label="Loading account settings..." /> : null}

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
        <>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ borderColor: "divider", p: 2.5, borderRadius: 4, height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Email alerts
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Primary email: <strong>{profile?.email ?? "—"}</strong>
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Verification status:{" "}
              <Box component="span" sx={{ fontWeight: 700, color: profile?.email_verified ? "success.main" : "warning.main" }}>
                {profile?.email_verified ? "Verified" : "Pending verification"}
              </Box>
            </Typography>
            {!profile?.email_verified ? (
              <Button component={NextLink} href="/verify-email" variant="outlined" color="warning" size="small" sx={{ mt: 2 }}>
                Verify email now
              </Button>
            ) : null}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ borderColor: "divider", p: 2.5, borderRadius: 4, height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              SMS contact management
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              SMS is used for urgent provisioning and billing follow-up notifications.
            </Typography>

            <Stack spacing={1.5} sx={{ mt: 2 }}>
              <TextField
                label="Phone number (E.164 recommended)"
                size="small"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="+255700000000"
              />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="small" disabled={phoneBusy} onClick={() => void savePhone()}>
                  {phoneBusy ? "Saving..." : "Save phone"}
                </Button>
                <Button variant="outlined" color="inherit" size="small" disabled={phoneBusy} onClick={() => setPhoneInput("")}>
                  Clear
                </Button>
              </Stack>
              {phoneNotice ? <Typography variant="caption" color="success.main">{phoneNotice}</Typography> : null}
              {phoneError ? <Typography variant="caption" color="error.main">{phoneError}</Typography> : null}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderColor: "divider", p: 2.5, borderRadius: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Notification preferences
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Choose which alert categories should remain enabled for this browser session.
        </Typography>

        <Grid container spacing={1.5} sx={{ mt: 1.25 }}>
          {preferenceOptions.map((option) => (
            <Grid key={option.key} size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
                <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(preferences[option.key])}
                        onChange={(event) =>
                          setPreferences((current) => ({
                            ...current,
                            [option.key]: event.target.checked,
                          }))
                        }
                      />
                    }
                    label={option.label}
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="outlined" size="small" disabled={preferencesBusy} onClick={() => void savePreferences()}>
            {preferencesBusy ? "Saving..." : "Save preferences"}
          </Button>
          {preferencesNotice ? <Typography variant="caption" color="success.main">{preferencesNotice}</Typography> : null}
          {preferencesError ? <Typography variant="caption" color="error.main">{preferencesError}</Typography> : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ borderColor: "divider", p: 2.5, borderRadius: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          What to do next
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          After saving settings, continue with the workflow queue that needs attention.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap" }}>
          <Button component={NextLink} href="/billing" variant="outlined" size="small">
            Payment center
          </Button>
          <Button component={NextLink} href="/onboarding" variant="outlined" size="small">
            Setup progress
          </Button>
          <Button component={NextLink} href="/dashboard/registry" variant="outlined" size="small">
            Workspace registry
          </Button>
        </Stack>
      </Paper>
        </>
      ) : null}
    </Stack>
  );
}
