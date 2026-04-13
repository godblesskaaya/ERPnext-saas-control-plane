"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadAuthHealthSnapshot, signupAndLogin } from "../../../domains/auth/application/authUseCases";
import { getToken } from "../../../domains/auth/auth";
import { PublicRouteGuidance } from "../../../domains/auth/ui/PublicRouteGuidance";
import { Badge, Button, Card, Input } from "../../../domains/shared/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState("checking");
  const [authHealth, setAuthHealth] = useState("checking");
  const [billingHealth, setBillingHealth] = useState("checking");

  useEffect(() => {
    if (getToken()) {
      router.replace("/app/overview");
      return;
    }

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
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await signupAndLogin({ email, phone, password, persistToken: true });
      setNotice("Account created. Please verify your email from your inbox before creating a workspace.");
      router.push("/app/overview?verifyEmail=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">Create your account / Fungua akaunti</h1>
        <p className="text-sm text-slate-600">Create your account, verify your email, then continue onboarding.</p>
      </div>

      <PublicRouteGuidance
        whereAmI="Create account"
        whatNext="Complete account details, submit once, then verify your email before workspace setup."
        nextHref="/login"
        nextLabel="Already have an account? Sign in"
      />

      <div className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Before you continue</p>
        <ul className="mt-2 space-y-1">
          <li>• Pricing can be communicated with Tanzania-focused context, including TZS estimate wording.</li>
          <li>• Checkout language is suitable for teams using card or mobile-money compatible payment providers.</li>
          <li>• Interface copy is intentionally easy to follow for Swahili and English speaking teams.</li>
        </ul>
      </div>

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
          label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          type="email"
          required
        />
        <Input
          label="Phone number"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+255 ..."
          type="tel"
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          minLength={8}
          required
        />
        <Button className="w-full" loading={busy}>
          {busy ? "Creating account..." : "Create account and continue"}
        </Button>
      </form>

      {notice ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      ) : null}
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <p className="text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-700 hover:text-blue-600">
          Sign in now
        </Link>
      </p>
    </Card>
  );
}
