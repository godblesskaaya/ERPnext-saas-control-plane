"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  loadCurrentUserProfile,
  loadTenantStatus,
  loadWorkspaceReadiness,
  parsePersistedOnboardingState,
  renewCheckoutLink as renewCheckoutLinkUseCase,
  restorePersistedTenant,
  retryProvisioning as retryTenantProvisioningUseCase,
  sendVerificationEmailAgain,
  submitTenantOnboarding,
  validateSubdomain,
} from "../../../domains/onboarding/application/onboardingUseCases";
import {
  flowLabels,
  onboardingFlow as flow,
  sanitizeSubdomain,
  statusLabel,
  TERMINAL_TENANT_STATUSES,
  type OnboardingStep,
  type PersistedOnboardingState,
  type TenantRecord,
} from "../../../domains/onboarding/domain/onboardingFlow";
import { BUSINESS_APP_OPTIONS, PlanSelector } from "../../../domains/onboarding/components/PlanSelector";
import { OnboardingEmailVerificationPanel } from "../../../domains/onboarding/ui/OnboardingEmailVerificationPanel";
import { OnboardingNoticePanel } from "../../../domains/onboarding/ui/OnboardingNoticePanel";
import { OnboardingPageHeader } from "../../../domains/onboarding/ui/OnboardingPageHeader";
import { OnboardingStepTracker } from "../../../domains/onboarding/ui/OnboardingStepTracker";
import type { SubdomainAvailability, UserProfile } from "../../../domains/shared/lib/types";
const ONBOARDING_STATE_KEY = "erp-saas:onboarding-state:v1";

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
  const [readinessStatus, setReadinessStatus] = useState<{ ready: boolean; message: string } | null>(null);
  const [readinessChecking, setReadinessChecking] = useState(false);
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewNotice, setRenewNotice] = useState<string | null>(null);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [longWaitNotice, setLongWaitNotice] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const hydratedRef = useRef(false);
  const pollingDelayRef = useRef(5000);
  const pollingTimerRef = useRef<number | null>(null);
  const pollingStartRef = useRef<number | null>(null);

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

    const parsed = parsePersistedOnboardingState(raw);
    if (!parsed) {
      clearPersistedState();
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
        const restoredState = await restorePersistedTenant(restoredTenantId, restoredCheckoutUrl);
        setTenant(restoredState.tenant);
        setProgress(restoredState.progress);
        setStep(restoredState.step);
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

    let active = true;
    setSubdomainChecking(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await validateSubdomain(cleanSubdomain);
        if (!active) return;
        setSubdomainAvailability(result);
        if (active) setSubdomainChecking(false);
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
        const user = await loadCurrentUserProfile();
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
    pollingDelayRef.current = 5000;
    pollingStartRef.current = Date.now();
    setLongWaitNotice(null);

    const clearTimer = () => {
      if (pollingTimerRef.current) {
        window.clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const stopPolling = () => {
      active = false;
      clearTimer();
    };

    const schedulePoll = () => {
      if (!active || document.hidden) return;
      pollingTimerRef.current = window.setTimeout(async () => {
        try {
          const latest = await loadTenantStatus(tenant.id);
          if (!active) return;

          setTenant(latest.tenant);
          const nextStatus = latest.status;
          setProgress(latest.progress);

          if (nextStatus === "active") {
            setStep("success");
            setError(null);
            clearPersistedState();
            stopPolling();
            return;
          }
          if (nextStatus === "failed") {
            setError("Provisioning failed. You can retry or contact support.");
            stopPolling();
            return;
          }
          if (TERMINAL_TENANT_STATUSES.has(nextStatus)) {
            stopPolling();
            return;
          }
        } catch (err) {
          if (!active) return;
          const message = err instanceof Error ? err.message : "Unable to load provisioning status";

          if (message.toLowerCase().includes("404")) {
            clearPersistedState();
            setTenant(null);
            setStep("details");
            setError("Saved onboarding session was not found. Please start again.");
            stopPolling();
            return;
          }

          if (message.includes("401") || message.toLowerCase().includes("not authenticated")) {
            router.push("/login?sessionExpired=1&next=/onboarding");
            stopPolling();
            return;
          }

          setError(message);
        }

        const elapsed = pollingStartRef.current ? Date.now() - pollingStartRef.current : 0;
        if (elapsed > 15 * 60 * 1000) {
          setLongWaitNotice("Provisioning is taking longer than expected. We are still working—contact support if this persists.");
        }
        if (elapsed > 30 * 60 * 1000) {
          setLongWaitNotice("Provisioning timed out. Please contact support to continue.");
          stopPolling();
          return;
        }

        pollingDelayRef.current = Math.min(pollingDelayRef.current * 2, 30000) + Math.floor(Math.random() * 500);
        schedulePoll();
      }, pollingDelayRef.current);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
        return;
      }
      pollingDelayRef.current = 5000;
      void (async () => {
        try {
          const latest = await loadTenantStatus(tenant.id);
          if (!active) return;
          const nextStatus = latest.status;
          setTenant(latest.tenant);
          setProgress(latest.progress);
          if (nextStatus === "active") {
            setStep("success");
            setError(null);
            clearPersistedState();
            stopPolling();
            return;
          }
          if (TERMINAL_TENANT_STATUSES.has(nextStatus)) {
            if (nextStatus === "failed") {
              setError("Provisioning failed. You can retry or contact support.");
            }
            stopPolling();
            return;
          }
          schedulePoll();
        } catch {
          if (active) {
            schedulePoll();
          }
        }
      })();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedulePoll();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopPolling();
    };
  }, [router, step, tenant?.id]);

  useEffect(() => {
    if (step !== "success" || !tenant?.id) return;
    let active = true;
    setReadinessChecking(true);
    void (async () => {
      try {
        const result = await loadWorkspaceReadiness(tenant.id);
        if (!active) return;
        if (result.supported) {
          setReadinessStatus({ ready: result.data.ready, message: result.data.message });
        } else {
          setReadinessStatus({ ready: true, message: "Workspace status check not available." });
        }
      } catch (err) {
        if (!active) return;
        setReadinessStatus({ ready: false, message: err instanceof Error ? err.message : "Readiness check failed." });
      } finally {
        if (active) setReadinessChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [step, tenant?.id]);

  const submitTenant = async () => {
    if (emailVerificationRequired) {
      setVerificationNotice("Please verify your email before creating a workspace.");
      return;
    }
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
      const onboardingState = await submitTenantOnboarding({
        subdomain: cleanSubdomain,
        companyName,
        plan,
        chosenApp,
      });

      setTenant(onboardingState.tenant);
      setCheckoutUrl(onboardingState.checkoutUrl);
      setProgress(onboardingState.progress);
      setStep(onboardingState.step);
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
      const result = await sendVerificationEmailAgain();
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

  const renewCheckout = async () => {
    if (!tenant?.id) return;
    setRenewBusy(true);
    setRenewNotice(null);
    setRenewError(null);
    try {
      const result = await renewCheckoutLinkUseCase(tenant.id);
      if (!result.supported) {
        setRenewError("Checkout renewal is not available on this backend.");
        return;
      }
      setTenant(result.data.tenant as TenantRecord);
      setCheckoutUrl(result.data.checkout_url ?? null);
      setRenewNotice("A new checkout link is ready.");
    } catch (err) {
      setRenewError(err instanceof Error ? err.message : "Unable to renew checkout link.");
    } finally {
      setRenewBusy(false);
    }
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

  const retryProvisioning = async () => {
    if (!tenant?.id) return;
    setRetryBusy(true);
    setRetryError(null);
    setError(null);
    try {
      const result = await retryTenantProvisioningUseCase(tenant.id);
      if (!result.supported) {
        setRetryError("Retry endpoint is not available on this backend.");
        return;
      }
      setStep("waiting");
      setProgress(35);
      setLongWaitNotice(null);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetryBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl space-y-5 rounded-3xl border border-amber-200/70 bg-white/80 p-4 sm:p-6 lg:p-8">
      <OnboardingPageHeader
        title="Get your team live faster"
        description="Set up once, then run daily sales, stock, and finance operations from office or mobile across Tanzania."
      />

      <OnboardingStepTracker steps={flow} labels={flowLabels} activeStep={step} />

      {notice ? <OnboardingNoticePanel tone="success">{notice}</OnboardingNoticePanel> : null}

      {error ? <OnboardingNoticePanel tone="error">{error}</OnboardingNoticePanel> : null}

      {emailVerificationRequired ? (
        <OnboardingEmailVerificationPanel
          email={currentUser?.email}
          resendBusy={resendBusy}
          verificationNotice={verificationNotice}
          onResend={() => {
            void resendVerification();
          }}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-5 rounded-3xl border border-amber-200/70 bg-white/80 p-4">
          {step === "details" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-[#fdf7ee] p-3 text-xs text-slate-600">
                Tell us who this workspace is for so your team can start with the right URL and ownership context.
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">Company name</label>
                <input
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Mlimani Traders Ltd"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">Subdomain</label>
                <input
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-slate-900"
                  value={subdomain}
                  onChange={(event) => setSubdomain(event.target.value)}
                  placeholder="mlimani"
                  required
                />
                <p className="mt-2 text-sm text-slate-500">
                  Preview: <span className="font-medium text-[#0d6a6a]">https://{previewDomain}</span>
                </p>
                <p
                  className={`mt-1 text-xs ${
                    !cleanSubdomain
                      ? "text-slate-500"
                      : subdomainChecking
                        ? "text-amber-700"
                        : subdomainAvailability?.available
                          ? "text-emerald-700"
                          : "text-red-600"
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
                className="rounded-full bg-[#0d6a6a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b5a5a] disabled:opacity-60"
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

              <div className="rounded-2xl border border-amber-200 bg-[#fdf7ee] p-3 text-xs text-slate-600">
                Selected plan: <span className="text-slate-900">{plan}</span>
                {plan.toLowerCase() === "business" ? (
                  <>
                    {" · "}Business focus: <span className="text-[#0d6a6a]">{selectedBusinessApp?.label ?? chosenApp}</span>
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-amber-200 px-4 py-2 text-sm text-slate-700 hover:border-amber-300"
                  onClick={() => setStep("details")}
                >
                  Back
                </button>
                <button
                  className="rounded-full bg-[#0d6a6a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b5a5a] disabled:opacity-60"
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
            <div className="space-y-4 rounded-2xl border border-amber-200 bg-white/80 p-5">
              <h2 className="text-xl font-semibold text-slate-900">Complete payment to unlock provisioning</h2>
              <p className="text-sm text-slate-600">
                Checkout is ready for <span className="text-[#0d6a6a]">{tenant?.company_name}</span> on the{" "}
                <span className="text-[#0d6a6a]">{plan}</span> plan.
              </p>
              {plan.toLowerCase() === "business" ? (
                <p className="text-xs text-emerald-700">Primary app: {selectedBusinessApp?.label ?? chosenApp}</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full bg-[#0d6a6a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b5a5a]"
                  onClick={launchCheckout}
                  disabled={!checkoutUrl}
                >
                  Open checkout
                </button>
                <button
                  className="rounded-full border border-amber-200 px-4 py-2 text-sm text-slate-700 hover:border-amber-300 disabled:opacity-60"
                  onClick={() => {
                    void renewCheckout();
                  }}
                  disabled={renewBusy}
                >
                  {renewBusy ? "Generating link..." : "Generate new checkout link"}
                </button>
                <button
                  className="rounded-full border border-amber-200 px-4 py-2 text-sm text-slate-700 hover:border-amber-300"
                  onClick={() => setStep("waiting")}
                >
                  I already completed payment
                </button>
              </div>
              {!checkoutUrl ? (
                <p className="text-xs text-amber-700">Checkout link has expired or is missing. Generate a new link.</p>
              ) : null}
              {renewNotice ? <p className="text-xs text-emerald-700">{renewNotice}</p> : null}
              {renewError ? <p className="text-xs text-red-700">{renewError}</p> : null}
            </div>
          ) : null}

          {step === "waiting" ? (
            <div className="space-y-4 rounded-2xl border border-amber-200 bg-white/80 p-5">
              <h2 className="text-xl font-semibold text-slate-900">Workspace setup is in progress</h2>
              <p className="text-sm text-slate-600">
                {statusLabel((tenant?.status ?? "pending").toLowerCase())}. Status refresh runs automatically every few seconds.
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-amber-100">
                <div className="h-full rounded-full bg-[#0d6a6a] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-slate-500">Current status: {tenant?.status ?? "pending"}</p>
              {longWaitNotice ? (
                <OnboardingNoticePanel tone="warning" className="text-xs">
                  {longWaitNotice}
                </OnboardingNoticePanel>
              ) : null}
              {(tenant?.status ?? "").toLowerCase() === "failed" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-[#0d6a6a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={() => void retryProvisioning()}
                    disabled={retryBusy}
                  >
                    {retryBusy ? "Retrying..." : "Retry provisioning"}
                  </button>
                  <button
                    className="rounded-full border border-amber-200 px-3 py-1.5 text-xs text-slate-700 hover:border-amber-300"
                    onClick={() => router.push("/dashboard/support")}
                  >
                    Contact support
                  </button>
                  {retryError ? <p className="w-full text-xs text-red-700">{retryError}</p> : null}
                </div>
              ) : null}
              {checkoutUrl ? (
                <button
                  className="rounded-full border border-amber-200 px-3 py-1.5 text-xs text-slate-700 hover:border-amber-300"
                  onClick={launchCheckout}
                >
                  Re-open checkout
                </button>
              ) : null}
            </div>
          ) : null}

          {step === "success" ? (
            <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <h2 className="text-xl font-semibold text-emerald-900">Workspace ready 🎉</h2>
              <p className="text-sm text-emerald-800">Share this URL with your team and start your first daily operations cycle.</p>
              <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm text-[#0d6a6a]">{erpUrl}</div>
              {readinessStatus ? (
                <p
                  className={`rounded-2xl border p-3 text-xs ${
                    readinessStatus.ready
                      ? "border-emerald-200 bg-white text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  {readinessStatus.message}
                </p>
              ) : readinessChecking ? (
                <OnboardingNoticePanel tone="warning" className="text-xs">
                  Checking workspace readiness...
                </OnboardingNoticePanel>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-emerald-300 px-4 py-2 text-sm text-emerald-800 hover:border-emerald-400"
                  onClick={() => {
                    void copyUrl();
                  }}
                >
                  {copied ? "Copied" : "Copy URL"}
                </button>
                <a
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  href={erpUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open workspace
                </a>
                <button
                  className="rounded-full border border-amber-200 px-4 py-2 text-sm text-slate-700 hover:border-amber-300"
                  onClick={() => router.push("/dashboard")}
                >
                  Go to operations dashboard
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-3 rounded-3xl border border-amber-200/70 bg-white/80 p-4 text-sm">
          <h2 className="font-semibold text-slate-900">Setup snapshot</h2>
          <div className="space-y-2 text-xs text-slate-600">
            <p>
              <span className="text-slate-500">Company:</span> {companyName || "—"}
            </p>
            <p>
              <span className="text-slate-500">Subdomain:</span> {cleanSubdomain || "—"}
            </p>
            <p>
              <span className="text-slate-500">Plan:</span> {plan}
            </p>
            <p>
              <span className="text-slate-500">Business app:</span> {plan === "business" ? selectedBusinessApp?.label ?? chosenApp : "n/a"}
            </p>
            <p>
              <span className="text-slate-500">Status:</span> {tenant?.status ?? "draft"}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200/70 bg-[#fdf7ee] p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-900">Mobile-first tip</p>
            <p className="mt-1">
              Keep this URL accessible in your operations WhatsApp group so branch staff can quickly access the live environment.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200/70 bg-white p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-900">Compatibility note</p>
            <p className="mt-1">If chosen_app is unsupported on the backend version, submission retries in compatibility mode.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
