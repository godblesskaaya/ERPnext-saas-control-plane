"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PlanSelector, BUSINESS_APP_OPTIONS } from "../../components/PlanSelector";
import { api } from "../../lib/api";
import type { SubdomainAvailability, UserProfile } from "../../lib/types";

type OnboardingStep = "details" | "plan" | "payment" | "waiting" | "success";

type TenantRecord = {
  id: string;
  subdomain: string;
  domain: string;
  company_name: string;
  plan: string;
  chosen_app?: string | null;
  status: string;
};

type TenantCreateResponse = {
  tenant: TenantRecord;
  checkout_url?: string | null;
};

type PersistedOnboardingState = {
  step: OnboardingStep;
  subdomain: string;
  companyName: string;
  plan: string;
  chosenApp: string;
  tenantId: string | null;
  checkoutUrl: string | null;
};

const flow = ["details", "plan", "payment", "waiting", "success"] as const;
const ONBOARDING_STATE_KEY = "erp-saas:onboarding-state:v1";
const flowLabels: Record<OnboardingStep, string> = {
  details: "1. Business details",
  plan: "2. Choose operating level",
  payment: "3. Confirm payment",
  waiting: "4. Provisioning",
  success: "5. Go live",
};

function sanitizeSubdomain(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function progressForStatus(status: string): number {
  switch (status) {
    case "pending_payment":
      return 20;
    case "pending":
      return 45;
    case "provisioning":
      return 75;
    case "active":
      return 100;
    case "failed":
      return 100;
    default:
      return 35;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending_payment":
      return "Awaiting payment confirmation";
    case "pending":
      return "Queued for provisioning";
    case "provisioning":
      return "Provisioning in progress";
    case "active":
      return "Workspace is ready";
    case "failed":
      return "Provisioning failed";
    default:
      return status || "Starting";
  }
}

function deriveStepFromTenant(tenant: TenantRecord, checkoutUrl: string | null): OnboardingStep {
  const status = (tenant.status ?? "").toLowerCase();
  if (status === "active") return "success";
  if (status === "pending_payment") return checkoutUrl ? "payment" : "waiting";
  if (status === "pending" || status === "provisioning" || status === "failed") return "waiting";
  return "details";
}

function clearPersistedState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ONBOARDING_STATE_KEY);
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<OnboardingStep>("details");
  const [subdomain, setSubdomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [chosenApp, setChosenApp] = useState("erpnext");
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [subdomainAvailability, setSubdomainAvailability] = useState<SubdomainAvailability | null>(null);
  const [subdomainChecking, setSubdomainChecking] = useState(false);
  const [restored, setRestored] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  const hydratedRef = useRef(false);

  const cleanSubdomain = useMemo(() => sanitizeSubdomain(subdomain), [subdomain]);
  const previewDomain = `${cleanSubdomain || "your-company"}.erp.your-domain.com`;
  const selectedBusinessApp = BUSINESS_APP_OPTIONS.find((option) => option.id === chosenApp);
  const canUseSubdomain = Boolean(cleanSubdomain.length >= 3 && subdomainAvailability?.available);
  const emailVerificationRequired = Boolean(currentUser && !currentUser.email_verified);

  useEffect(() => {
    if (plan.toLowerCase() !== "business") {
      setChosenApp("erpnext");
    }
  }, [plan]);

  useEffect(() => {
    if (typeof window === "undefined" || hydratedRef.current) return;
    hydratedRef.current = true;

    const raw = window.localStorage.getItem(ONBOARDING_STATE_KEY);
    if (!raw) {
      setRestored(true);
      return;
    }

    let parsed: PersistedOnboardingState | null = null;
    try {
      parsed = JSON.parse(raw) as PersistedOnboardingState;
    } catch {
      clearPersistedState();
      setRestored(true);
      return;
    }

    if (!parsed) {
      setRestored(true);
      return;
    }

    setStep(parsed.step || "details");
    setSubdomain(parsed.subdomain || "");
    setCompanyName(parsed.companyName || "");
    setPlan(parsed.plan || "starter");
    setChosenApp(parsed.chosenApp || "erpnext");
    setCheckoutUrl(parsed.checkoutUrl || null);

    const restoredTenantId = parsed.tenantId;
    const restoredCheckoutUrl = parsed.checkoutUrl || null;

    if (!restoredTenantId) {
      setRestored(true);
      return;
    }

    void (async () => {
      try {
        const latest = (await api.getTenant(restoredTenantId)) as TenantRecord;
        setTenant(latest);
        setProgress(progressForStatus((latest.status ?? "").toLowerCase()));
        setStep(deriveStepFromTenant(latest, restoredCheckoutUrl));
      } catch (err) {
        clearPersistedState();
        const message = err instanceof Error ? err.message : "Unable to restore onboarding state";
        if (message.toLowerCase().includes("404")) {
          setTenant(null);
          setStep("details");
        }
      } finally {
        setRestored(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    if (step === "success") {
      clearPersistedState();
      return;
    }

    const state: PersistedOnboardingState = {
      step,
      subdomain,
      companyName,
      plan,
      chosenApp,
      tenantId: tenant?.id ?? null,
      checkoutUrl,
    };
    window.localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(state));
  }, [restored, step, subdomain, companyName, plan, chosenApp, tenant?.id, checkoutUrl]);

  useEffect(() => {
    if (!restored) return;
    if (tenant?.id) return;
    if (!(step === "details" || step === "plan")) return;

    if (!cleanSubdomain) {
      setSubdomainAvailability(null);
      setSubdomainChecking(false);
      return;
    }

    if (cleanSubdomain.length < 3) {
      setSubdomainAvailability({
        subdomain: cleanSubdomain,
        domain: null,
        available: false,
        reason: "invalid",
        message: "Subdomain must be at least 3 characters.",
      });
      setSubdomainChecking(false);
      return;
    }

    let active = true;
    setSubdomainChecking(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await api.checkSubdomainAvailability(cleanSubdomain);
          if (!active) return;
          setSubdomainAvailability(result);
        } catch (err) {
          if (!active) return;
          setSubdomainAvailability({
            subdomain: cleanSubdomain,
            domain: null,
            available: false,
            reason: "invalid",
            message: err instanceof Error ? err.message : "Could not validate subdomain",
          });
        } finally {
          if (active) setSubdomainChecking(false);
        }
      })();
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(timer);
      setSubdomainChecking(false);
    };
  }, [cleanSubdomain, restored, step, tenant?.id]);

  useEffect(() => {
    if (searchParams.get("welcome") === "1") {
      setNotice("Welcome! Let’s configure your first workspace.");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      try {
        const user = await api.getCurrentUser();
        if (cancelled) return;
        setCurrentUser(user);
      } catch {
        if (cancelled) return;
      }
    };
    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "waiting" || !tenant?.id) return;

    let active = true;
    const poll = async () => {
      try {
        const latest = (await api.getTenant(tenant.id)) as TenantRecord;
        if (!active) return;

        setTenant(latest);
        const nextStatus = (latest.status ?? "").toLowerCase();
        setProgress(progressForStatus(nextStatus));

        if (nextStatus === "active") {
          setStep("success");
          setError(null);
          clearPersistedState();
        } else if (nextStatus === "failed") {
          setError("Provisioning failed. Please contact support or retry with a different subdomain.");
        }
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load provisioning status";

        if (message.toLowerCase().includes("404")) {
          clearPersistedState();
          setTenant(null);
          setStep("details");
          setError("Saved onboarding session was not found. Please start again.");
          return;
        }

        if (message.includes("401") || message.toLowerCase().includes("not authenticated")) {
          router.push("/login?sessionExpired=1&next=/onboarding");
          return;
        }

        setError(message);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [router, step, tenant?.id]);

  const submitTenant = async () => {
    if (!cleanSubdomain || cleanSubdomain.length < 3) {
      setError("Please choose a valid subdomain (at least 3 characters).");
      return;
    }
    if (!subdomainAvailability?.available) {
      setError(subdomainAvailability?.message || "Please choose an available subdomain before continuing.");
      return;
    }

    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = (await api.createTenant({
        subdomain: cleanSubdomain,
        company_name: companyName.trim(),
        plan,
        ...(plan.toLowerCase() === "business" ? { chosen_app: chosenApp } : {}),
      })) as TenantCreateResponse | TenantRecord;

      const payload = (response as TenantCreateResponse).tenant
        ? (response as TenantCreateResponse)
        : { tenant: response as TenantRecord, checkout_url: null };

      setTenant(payload.tenant);
      setCheckoutUrl(payload.checkout_url ?? null);
      setProgress(progressForStatus((payload.tenant.status ?? "").toLowerCase()));
      setStep(payload.checkout_url ? "payment" : "waiting");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create tenant";
      setError(message);
      if (message.toLowerCase().includes("verify") && message.toLowerCase().includes("email")) {
        setVerificationNotice("Please verify your email first, then retry tenant creation.");
      }
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setResendBusy(true);
    try {
      const result = await api.resendVerification();
      setVerificationNotice(result.message || "Verification email sent. Check your inbox.");
    } catch (err) {
      setVerificationNotice(err instanceof Error ? err.message : "Unable to resend verification email.");
    } finally {
      setResendBusy(false);
    }
  };

  const launchCheckout = () => {
    if (checkoutUrl) {
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
    }
    setStep("waiting");
    setProgress((current) => Math.max(current, 35));
  };

  const erpUrl = tenant?.domain ? `https://${tenant.domain}` : `https://${previewDomain}`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(erpUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const activeIndex = flow.indexOf(step);

  return (
    <section className="mx-auto max-w-5xl space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">Get your team live faster</h1>
        <p className="text-sm text-slate-300">
          Set up once, then run daily sales, stock, and finance operations from office or mobile across Tanzania.
        </p>
      </header>

      <ol className="grid gap-2 text-[11px] uppercase tracking-wide text-slate-400 md:grid-cols-5">
        {flow.map((item, index) => (
          <li
            key={item}
            className={`rounded border px-2 py-2 text-center ${
              index <= activeIndex ? "border-sky-400/60 bg-sky-500/10 text-sky-200" : "border-slate-800 bg-slate-950/40"
            }`}
          >
            {flowLabels[item]}
          </li>
        ))}
      </ol>

      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{notice}</p>
      ) : null}

      {error ? <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      {emailVerificationRequired ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100">
          <p className="font-medium">Email verification required before tenant creation.</p>
          <p className="mt-1 text-xs text-amber-200/90">
            We sent a verification link to <span className="font-medium">{currentUser?.email}</span>.
          </p>
          <button
            className="mt-3 rounded border border-amber-300/40 px-3 py-1.5 text-xs text-amber-100 hover:border-amber-200 disabled:opacity-60"
            onClick={() => {
              void resendVerification();
            }}
            disabled={resendBusy}
          >
            {resendBusy ? "Sending..." : "Resend verification email"}
          </button>
          {verificationNotice ? <p className="mt-2 text-xs text-amber-100">{verificationNotice}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          {step === "details" ? (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
                Tell us who this workspace is for so your team can start with the right URL and ownership context.
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300">Company name</label>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Mlimani Traders Ltd"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300">Subdomain</label>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  value={subdomain}
                  onChange={(event) => setSubdomain(event.target.value)}
                  placeholder="mlimani"
                  required
                />
                <p className="mt-2 text-sm text-slate-400">
                  Preview: <span className="font-medium text-sky-200">https://{previewDomain}</span>
                </p>
                <p
                  className={`mt-1 text-xs ${
                    !cleanSubdomain
                      ? "text-slate-400"
                      : subdomainChecking
                        ? "text-amber-300"
                        : subdomainAvailability?.available
                          ? "text-emerald-300"
                          : "text-red-300"
                  }`}
                >
                  {!cleanSubdomain
                    ? "Enter a subdomain to verify availability."
                    : subdomainChecking
                      ? "Checking subdomain availability..."
                      : subdomainAvailability?.message ?? "Subdomain availability not checked yet."}
                </p>
              </div>
              <button
                className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
                onClick={() => {
                  setError(null);
                  setStep("plan");
                }}
                disabled={!canUseSubdomain || subdomainChecking}
              >
                Continue to package selection
              </button>
            </div>
          ) : null}

          {step === "plan" ? (
            <div className="space-y-4">
              <PlanSelector value={plan} onChange={setPlan} chosenApp={chosenApp} onChosenAppChange={setChosenApp} />

              <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
                Selected plan: <span className="text-slate-100">{plan}</span>
                {plan.toLowerCase() === "business" ? (
                  <>
                    {" · "}Business focus: <span className="text-emerald-200">{selectedBusinessApp?.label ?? chosenApp}</span>
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
                  onClick={() => setStep("details")}
                >
                  Back
                </button>
                <button
                  className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
                  onClick={() => {
                    void submitTenant();
                  }}
                  disabled={busy || !canUseSubdomain || subdomainChecking || emailVerificationRequired}
                >
                  {busy ? "Submitting..." : "Submit and continue"}
                </button>
              </div>
            </div>
          ) : null}

          {step === "payment" ? (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-5">
              <h2 className="text-xl font-semibold text-white">Complete payment to unlock provisioning</h2>
              <p className="text-sm text-slate-300">
                Checkout is ready for <span className="text-sky-200">{tenant?.company_name}</span> on the{" "}
                <span className="text-sky-200">{plan}</span> plan.
              </p>
              {plan.toLowerCase() === "business" ? (
                <p className="text-xs text-emerald-200">Primary app: {selectedBusinessApp?.label ?? chosenApp}</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
                  onClick={launchCheckout}
                >
                  Open checkout
                </button>
                <button
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
                  onClick={() => setStep("waiting")}
                >
                  I already completed payment
                </button>
              </div>
            </div>
          ) : null}

          {step === "waiting" ? (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-5">
              <h2 className="text-xl font-semibold text-white">Workspace setup is in progress</h2>
              <p className="text-sm text-slate-300">
                {statusLabel((tenant?.status ?? "pending").toLowerCase())}. Status refresh runs automatically every few seconds.
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-slate-400">Current status: {tenant?.status ?? "pending"}</p>
              {checkoutUrl ? (
                <button
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                  onClick={launchCheckout}
                >
                  Re-open checkout
                </button>
              ) : null}
            </div>
          ) : null}

          {step === "success" ? (
            <div className="space-y-4 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-5">
              <h2 className="text-xl font-semibold text-emerald-100">Workspace ready 🎉</h2>
              <p className="text-sm text-emerald-100/90">Share this URL with your team and start your first daily operations cycle.</p>
              <div className="rounded-md border border-emerald-500/30 bg-slate-950/70 p-3 text-sm text-sky-200">{erpUrl}</div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-md border border-emerald-300/40 px-4 py-2 text-sm text-emerald-100 hover:border-emerald-200"
                  onClick={() => {
                    void copyUrl();
                  }}
                >
                  {copied ? "Copied" : "Copy URL"}
                </button>
                <a
                  className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
                  href={erpUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open workspace
                </a>
                <button
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
                  onClick={() => router.push("/dashboard")}
                >
                  Go to operations dashboard
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm">
          <h2 className="font-semibold text-white">Setup snapshot</h2>
          <div className="space-y-2 text-xs text-slate-300">
            <p>
              <span className="text-slate-400">Company:</span> {companyName || "—"}
            </p>
            <p>
              <span className="text-slate-400">Subdomain:</span> {cleanSubdomain || "—"}
            </p>
            <p>
              <span className="text-slate-400">Plan:</span> {plan}
            </p>
            <p>
              <span className="text-slate-400">Business app:</span> {plan === "business" ? selectedBusinessApp?.label ?? chosenApp : "n/a"}
            </p>
            <p>
              <span className="text-slate-400">Status:</span> {tenant?.status ?? "draft"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
            <p className="font-medium text-slate-100">Mobile-first tip</p>
            <p className="mt-1">
              Keep this URL accessible in your operations WhatsApp group so branch staff can quickly access the live environment.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
            <p className="font-medium text-slate-100">Compatibility note</p>
            <p className="mt-1">If chosen_app is unsupported on the backend version, submission retries in compatibility mode.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
