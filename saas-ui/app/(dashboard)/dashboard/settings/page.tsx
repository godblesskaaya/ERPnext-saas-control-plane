"use client";

import { useEffect, useState } from "react";

import { api, getApiErrorMessage } from "../../../../domains/shared/lib/api";
import type { UserProfile } from "../../../../domains/shared/lib/types";

export default function DashboardSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await api.getCurrentUser();
        if (!active) return;
        setProfile(current);
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
          <p className="text-sm font-semibold text-slate-900">SMS readiness</p>
          <p className="mt-2">
            Phone number: <span className="font-semibold text-slate-900">{profile?.phone || "Not configured"}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            SMS channels are used for urgent provisioning, billing, and support follow-up notifications.
          </p>
          <a
            href="/dashboard/support"
            className="mt-3 inline-flex rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-amber-300"
          >
            Request contact update
          </a>
        </article>
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

