"use client";

import { useEffect, useState } from "react";

import { api, getApiErrorMessage } from "../../../../domains/shared/lib/api";
import type { UserProfile } from "../../../../domains/shared/lib/types";

type NotificationPreferences = {
  emailAlerts: boolean;
  smsAlerts: boolean;
  billingAlerts: boolean;
  provisioningAlerts: boolean;
  supportAlerts: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailAlerts: true,
  smsAlerts: true,
  billingAlerts: true,
  provisioningAlerts: true,
  supportAlerts: true,
};
const PREFERENCES_STORAGE_KEY = "erp-saas:notification-preferences:v1";

function parsePreferences(raw: string | null): NotificationPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      emailAlerts: parsed.emailAlerts ?? DEFAULT_PREFERENCES.emailAlerts,
      smsAlerts: parsed.smsAlerts ?? DEFAULT_PREFERENCES.smsAlerts,
      billingAlerts: parsed.billingAlerts ?? DEFAULT_PREFERENCES.billingAlerts,
      provisioningAlerts: parsed.provisioningAlerts ?? DEFAULT_PREFERENCES.provisioningAlerts,
      supportAlerts: parsed.supportAlerts ?? DEFAULT_PREFERENCES.supportAlerts,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export default function DashboardSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesNotice, setPreferencesNotice] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await api.getCurrentUser();
        if (!active) return;
        setProfile(current);
        setPhoneInput(current.phone ?? "");
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(getApiErrorMessage(err, "Failed to load user settings"));
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
    // AGENT-NOTE: current backend has no per-user notification-preferences endpoint.
    // Persisting locally keeps settings usable now without inventing an unsupported API contract.
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences, preferencesLoaded]);

  const savePhone = async () => {
    setPhoneBusy(true);
    setPhoneNotice(null);
    setPhoneError(null);
    try {
      const updated = await api.updateCurrentUser({ phone: phoneInput.trim() || null });
      setProfile(updated);
      setPhoneInput(updated.phone ?? "");
      setPhoneNotice("Phone contact updated.");
    } catch (err) {
      setPhoneError(getApiErrorMessage(err, "Unable to update phone number."));
    } finally {
      setPhoneBusy(false);
    }
  };

  const savePreferences = () => {
    setPreferencesNotice("Notification preferences saved on this device.");
    window.setTimeout(() => setPreferencesNotice(null), 1800);
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Settings</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Notification and contact readiness</h1>
        <p className="mt-1 text-sm text-slate-600">
          Keep your contact channels ready so billing, provisioning, and support alerts reach your team quickly.
        </p>
      </div>

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-amber-200/70 bg-white/80 p-5 text-sm text-slate-700">
          <p className="text-sm font-semibold text-slate-900">Email alerts</p>
          <p className="mt-2">
            Primary email: <span className="font-semibold text-slate-900">{profile?.email ?? "—"}</span>
          </p>
          <p className="mt-1">
            Verification status:{" "}
            <span className={`font-semibold ${profile?.email_verified ? "text-emerald-700" : "text-amber-700"}`}>
              {profile?.email_verified ? "Verified" : "Pending verification"}
            </span>
          </p>
          {!profile?.email_verified ? (
            <a
              href="/verify-email"
              className="mt-3 inline-flex rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
            >
              Verify email now
            </a>
          ) : null}
        </article>

        <article className="rounded-3xl border border-amber-200/70 bg-white/80 p-5 text-sm text-slate-700">
          <p className="text-sm font-semibold text-slate-900">SMS contact management</p>
          <p className="mt-1 text-xs text-slate-600">
            SMS is used for urgent provisioning, billing, and support follow-up notifications.
          </p>
          <div className="mt-3 space-y-2">
            <label className="text-xs text-slate-500">Phone number (E.164 recommended)</label>
            <input
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              placeholder="+255700000000"
            />
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full bg-[#0d6a6a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b5a5a] disabled:opacity-60"
                disabled={phoneBusy}
                onClick={() => void savePhone()}
              >
                {phoneBusy ? "Saving..." : "Save phone"}
              </button>
              <button
                className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
                disabled={phoneBusy}
                onClick={() => setPhoneInput("")}
              >
                Clear
              </button>
            </div>
            {phoneNotice ? <p className="text-xs text-emerald-700">{phoneNotice}</p> : null}
            {phoneError ? <p className="text-xs text-red-700">{phoneError}</p> : null}
          </div>
        </article>
      </div>

      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-5 text-sm text-slate-700">
        <p className="text-sm font-semibold text-slate-900">Notification preferences</p>
        <p className="mt-1 text-xs text-slate-600">
          Choose which alert categories should remain enabled for this browser session.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            { key: "emailAlerts", label: "General email alerts" },
            { key: "smsAlerts", label: "SMS alerts" },
            { key: "billingAlerts", label: "Billing alerts" },
            { key: "provisioningAlerts", label: "Provisioning alerts" },
            { key: "supportAlerts", label: "Support alerts" },
          ].map((option) => (
            <label key={option.key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(preferences[option.key as keyof NotificationPreferences])}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    [option.key]: event.target.checked,
                  }))
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
            onClick={savePreferences}
          >
            Save preferences
          </button>
          {preferencesNotice ? <p className="text-xs text-emerald-700">{preferencesNotice}</p> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200/70 bg-white/80 p-5 text-sm text-slate-700">
        <p className="text-sm font-semibold text-slate-900">Operational routing shortcuts</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/dashboard/billing"
            className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
          >
            Billing follow-ups
          </a>
          <a
            href="/dashboard/onboarding"
            className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
          >
            Pending onboarding
          </a>
          <a
            href="/dashboard/support-overview"
            className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
          >
            Support overview
          </a>
        </div>
      </div>
    </section>
  );
}

