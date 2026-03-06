import Link from "next/link";

const featureCards = [
  {
    title: "Provisioning in minutes",
    description: "Launch isolated ERPNext sites with managed backups, jobs, and clear status tracking.",
  },
  {
    title: "Built-in billing",
    description: "Stripe checkout, plan controls, and lifecycle automation are integrated into onboarding.",
  },
  {
    title: "Secure by default",
    description: "Token-based access, tenant isolation, and auditable operations for every customer action.",
  },
];

const pricing = [
  {
    tier: "Starter",
    price: "$29",
    detail: "Single team, core ERP modules, daily backups",
  },
  {
    tier: "Business",
    price: "$79",
    detail: "Advanced workflows, priority jobs, more backup capacity",
  },
  {
    tier: "Enterprise",
    price: "Custom",
    detail: "Dedicated support, scale planning, tailored compliance",
  },
];

const workflow = [
  "Create your account and reserve a subdomain.",
  "Pick a plan and complete secure checkout.",
  "Track provisioning live until your ERP URL is ready.",
  "Open ERPNext instantly and invite your team.",
];

export default function LandingPage() {
  return (
    <div className="space-y-20 pb-10">
      <section className="grid gap-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl shadow-sky-950/20 lg:grid-cols-[1.3fr_1fr] lg:p-12">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sky-200">
            ERPNext SaaS Platform
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            Launch and manage ERPNext tenants with a modern self-serve experience.
          </h1>
          <p className="max-w-2xl text-lg text-slate-300">
            From signup to payment to provisioning, every step is streamlined so customers can reach their ERP URL faster.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Start free trial
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
          <p className="text-sm text-slate-300">Platform status</p>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/70 px-3 py-2">
              <span>Tenant provisioning</span>
              <span className="text-emerald-300">Operational</span>
            </div>
            <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/70 px-3 py-2">
              <span>Billing checkout</span>
              <span className="text-emerald-300">Operational</span>
            </div>
            <div className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/70 px-3 py-2">
              <span>Support SLA</span>
              <span className="text-sky-200">&lt; 4 hours</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="space-y-6">
        <h2 className="text-3xl font-semibold text-white">Features that scale with your tenants</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {featureCards.map((feature) => (
            <article key={feature.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="space-y-6">
        <h2 className="text-3xl font-semibold text-white">Transparent pricing</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {pricing.map((plan) => (
            <article key={plan.tier} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="text-lg font-semibold text-white">{plan.tier}</h3>
              <p className="mt-2 text-2xl font-bold text-sky-300">{plan.price}</p>
              <p className="mt-2 text-sm text-slate-300">{plan.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-3xl font-semibold text-white">How it works</h2>
        <ol className="grid gap-3 md:grid-cols-2">
          {workflow.map((step, index) => (
            <li key={step} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200">
              <span className="mr-2 rounded-full bg-sky-500/20 px-2 py-1 text-xs text-sky-200">Step {index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-slate-800 pt-8 text-sm text-slate-400">
        <p>© {new Date().getFullYear()} ERP SaaS Platform. Reliable ERPNext operations for modern teams.</p>
      </footer>
    </div>
  );
}
