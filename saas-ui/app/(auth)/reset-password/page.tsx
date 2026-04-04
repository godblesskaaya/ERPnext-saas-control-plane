"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { loadAuthHealthSnapshot, submitPasswordReset } from "../../../domains/auth/application/authUseCases";
import { PublicRouteGuidance } from "../../../domains/auth/ui/PublicRouteGuidance";
import { Badge, Button, Card, Input } from "../../../domains/shared/components/ui";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const initialToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking");
  const [authHealth, setAuthHealth] = useState("checking");
  const [billingHealth, setBillingHealth] = useState("checking");

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        setApiHealth(response.ok ? "ok" : "unavailable");
      } catch {
        setApiHealth("unavailable");
      }

      const health = await loadAuthHealthSnapshot();
      setAuthHealth(health.auth.message);
      setBillingHealth(health.billing.message);
    };

    void loadHealth();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const message = await submitPasswordReset(token, newPassword);
      setNotice(message);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Set new password / Weka nenosiri jipya</h1>
        <p className="text-sm text-slate-600">Use your one-time token and choose a new password for your account.</p>
      </div>

      <PublicRouteGuidance
        whereAmI="Confirm password reset"
        whatNext="Enter the one-time token, set a new password, then continue back to sign in."
        nextHref="/login"
        nextLabel="Return to sign in"
      />

      <div className="rounded-2xl border border-slate-200/90 bg-white/80 p-4 text-sm text-slate-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Diagnostics</p>
        <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            API: <Badge className="ml-1">{apiHealth}</Badge>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            Auth: <Badge className="ml-1">{authHealth}</Badge>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
            Billing: <Badge className="ml-1">{billingHealth}</Badge>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <Input
          label="Reset token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Reset token"
          autoComplete="one-time-code"
          required
        />
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="New password"
          minLength={8}
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm new password"
          minLength={8}
          required
        />
        <Button className="w-full" loading={busy}>
          {busy ? "Updating..." : "Reset password"}
        </Button>
      </form>

      {notice ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      ) : null}
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <p className="text-sm text-slate-600">
        Continue to{" "}
        <Link href="/login" className="text-blue-700 hover:text-blue-600">
          sign in
        </Link>
        .
      </p>
    </Card>
  );
}
