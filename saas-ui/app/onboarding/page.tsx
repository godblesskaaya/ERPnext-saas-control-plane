"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type OnboardingStep = "details" | "plan" | "payment" | "waiting" | "success";

type TenantRecord = {
  id: string;
  subdomain: string;
  domain: string;
  company_name: string;
  plan: string;
  status: string;
};

type TenantCreateResponse = {
  tenant: TenantRecord;
  checkout_url?: string | null;
};

const planOptions = [
  {
    id: "starter",
    name: "Starter",
    price: "$29/mo",
    description: "Small teams, essential modules, daily backups.",
  },
  {
    id: "business",
    name: "Business",
    price: "$79/mo",
    description: "Growing teams, faster support, richer automation.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    description: "Advanced compliance, scale support, bespoke rollout.",
  },
];

const flow = ["details", "plan", "payment", "waiting", "success"] as const;

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
      return "ERP instance is ready";
    case "failed":
      return "Provisioning failed";
    default:
      return status || "Starting";
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<OnboardingStep>("details");
  const [subdomain, setSubdomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState("starter");
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cleanSubdomain = useMemo(() => sanitizeSubdomain(subdomain), [subdomain]);
  const previewDomain = `${cleanSubdomain || "your-company"}.erp.your-domain.com`;

  useEffect(() => {
    if (searchParams.get("welcome") === "1") {
      setNotice("Welcome! Let’s configure your first ERP tenant.");
    }
  }, [searchParams]);

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
        } else if (nextStatus === "failed") {
          setError("Provisioning failed. Please contact support or retry with a different subdomain.");
        }
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load provisioning status";

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
      })) as TenantCreateResponse | TenantRecord;

      const payload = (response as TenantCreateResponse).tenant
        ? (response as TenantCreateResponse)
        : { tenant: response as TenantRecord, checkout_url: null };

      setTenant(payload.tenant);
      setCheckoutUrl(payload.checkout_url ?? null);
      setProgress(progressForStatus((payload.tenant.status ?? "").toLowerCase()));
      setStep(payload.checkout_url ? "payment" : "waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create tenant");
    } finally {
      setBusy(false);
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
    <section className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Tenant onboarding</h1>
        <p className="text-sm text-slate-300">
          Reserve your domain, confirm plan + billing, then track provisioning until your ERP URL is live.
        </p>
      </header>

      <ol className="grid gap-2 text-xs uppercase tracking-wide text-slate-400 md:grid-cols-5">
        {flow.map((item, index) => (
          <li
            key={item}
            className={`rounded border px-2 py-2 text-center ${
              index <= activeIndex
                ? "border-sky-400/60 bg-sky-500/10 text-sky-200"
                : "border-slate-800 bg-slate-950/40"
            }`}
          >
            {item.replace("_", " ")}
          </li>
        ))}
      </ol>

      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{notice}</p>
      ) : null}

      {error ? <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}

      {step === "details" ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Company name</label>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Acme Manufacturing"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Subdomain</label>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              value={subdomain}
              onChange={(event) => setSubdomain(event.target.value)}
              placeholder="acme"
              required
            />
            <p className="mt-2 text-sm text-slate-400">
              Preview: <span className="font-medium text-sky-200">https://{previewDomain}</span>
            </p>
          </div>
          <button
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            onClick={() => {
              setError(null);
              setStep("plan");
            }}
          >
            Continue to plan selection
          </button>
        </div>
      ) : null}

      {step === "plan" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {planOptions.map((option) => {
              const selected = plan === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPlan(option.id)}
                  className={`rounded-lg border p-4 text-left transition ${
                    selected
                      ? "border-sky-400 bg-sky-500/10"
                      : "border-slate-800 bg-slate-950/40 hover:border-slate-600"
                  }`}
                >
                  <p className="text-sm font-semibold text-white">{option.name}</p>
                  <p className="mt-1 text-lg text-sky-200">{option.price}</p>
                  <p className="mt-2 text-xs text-slate-300">{option.description}</p>
                </button>
              );
            })}
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
              disabled={busy}
            >
              {busy ? "Creating tenant..." : "Create tenant & continue"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "payment" ? (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-5">
          <h2 className="text-xl font-semibold text-white">Complete secure payment</h2>
          <p className="text-sm text-slate-300">
            We generated a checkout session for <span className="text-sky-200">{tenant?.company_name}</span> on the{" "}
            <span className="text-sky-200">{plan}</span> plan.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              onClick={launchCheckout}
            >
              Redirect to checkout
            </button>
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              onClick={() => setStep("waiting")}
            >
              I already paid
            </button>
          </div>
        </div>
      ) : null}

      {step === "waiting" ? (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-5">
          <h2 className="text-xl font-semibold text-white">Provisioning in progress</h2>
          <p className="text-sm text-slate-300">
            {statusLabel((tenant?.status ?? "pending").toLowerCase())}. We&apos;re polling tenant status automatically.
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
              Re-open payment checkout
            </button>
          ) : null}
        </div>
      ) : null}

      {step === "success" ? (
        <div className="space-y-4 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-5">
          <h2 className="text-xl font-semibold text-emerald-100">Your ERP instance is ready 🎉</h2>
          <p className="text-sm text-emerald-100/90">Use the URL below to open ERPNext for your team.</p>
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
              Open ERP
            </a>
            <button
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
              onClick={() => router.push("/dashboard")}
            >
              Go to dashboard
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
