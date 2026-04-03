import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), "utf8");
}

const publicAuthRoutes = {
  login: "app/(auth)/login/page.tsx",
  signup: "app/(auth)/signup/page.tsx",
  forgotPassword: "app/(auth)/forgot-password/page.tsx",
  resetPassword: "app/(auth)/reset-password/page.tsx",
  verifyEmail: "app/(auth)/verify-email/page.tsx",
} as const;

function hasPrimaryAction(source: string): boolean {
  return (
    /\b(Button|button)\b/.test(source) &&
    /(Continue|Sign in|Create account|Reset|Verify|Submit|Send)/.test(source)
  );
}

test("public auth routes expose hardened shell readability markers", () => {
  for (const [routeName, routePath] of Object.entries(publicAuthRoutes)) {
    const source = readSource(routePath);

    assert.equal(/<h1[^>]*>[^<]+<\/h1>/.test(source), true, `${routeName} should declare a clear route heading.`);
    assert.equal(source.includes("text-sm text-slate-600"), true, `${routeName} should include a short explanatory description.`);
    assert.equal(hasPrimaryAction(source), true, `${routeName} should expose a clear next-step action.`);
    assert.equal(source.includes("PublicRouteGuidance"), true, `${routeName} should include explicit route guidance.`);
    assert.equal(source.includes("whereAmI="), true, `${routeName} should provide where-am-I copy.`);
    assert.equal(source.includes("whatNext="), true, `${routeName} should provide what-next copy.`);

    const hasDiagnostics = source.includes("Diagnostics") && source.includes("API:") && source.includes("Auth:") && source.includes("Billing:");
    assert.equal(hasDiagnostics, true, `${routeName} should preserve diagnostics markers for backend contract visibility.`);
  }
});

test("auth layout keeps public wayfinding CTAs", () => {
  const source = readSource("app/(auth)/layout.tsx");

  assert.equal(source.includes("Biashara Cloud"), true, "auth layout should keep product identity marker.");
  assert.equal(source.includes('href="/login"'), true, "auth layout should expose sign-in wayfinding.");
  assert.equal(source.includes('href="/signup"'), true, "auth layout should expose start-now wayfinding.");
});

test("onboarding route keeps explicit where-am-i and what-next guidance without backend contract drift", () => {
  const source = readSource("app/(onboarding)/onboarding/page.tsx");

  assert.equal(source.includes("<OnboardingPageHeader"), true, "onboarding should keep top-level page heading component.");
  assert.equal(source.includes("<OnboardingStepTracker"), true, "onboarding should keep visible step hierarchy.");
  assert.equal(source.includes("Where am I"), true, "onboarding should provide where-am-I orientation copy.");
  assert.equal(source.includes("What next"), true, "onboarding should provide what-next orientation copy.");

  assert.equal(source.includes('step === "details"'), true, "onboarding should keep details phase.");
  assert.equal(source.includes("Continue to package selection"), true, "onboarding details step should expose next action copy.");

  assert.equal(source.includes('step === "plan"'), true, "onboarding should keep plan phase.");
  assert.equal(source.includes("Submit and continue"), true, "onboarding plan step should expose next action copy.");

  assert.equal(source.includes('step === "payment"'), true, "onboarding should keep payment phase.");
  assert.equal(source.includes("Open checkout"), true, "onboarding payment step should expose checkout action.");

  assert.equal(source.includes('step === "waiting"'), true, "onboarding should keep waiting phase.");
  assert.equal(source.includes("Workspace setup is in progress"), true, "onboarding waiting phase should explain current state.");

  assert.equal(source.includes('step === "success"'), true, "onboarding should keep success phase.");
  assert.equal(source.includes("Go to operations dashboard"), true, "onboarding success step should expose the next destination.");

  assert.equal(source.includes("submitTenantOnboarding"), true, "onboarding should keep tenant submission use case contract.");
  assert.equal(source.includes("loadWorkspaceReadiness"), true, "onboarding should keep workspace readiness contract.");
  assert.equal(source.includes("renewCheckoutLinkUseCase"), true, "onboarding should keep checkout renewal contract.");
  assert.equal(source.includes("retryTenantProvisioningUseCase"), true, "onboarding should keep provisioning retry contract.");
});

test("public landing route includes orientation guidance", () => {
  const source = readSource("app/(shared)/page.tsx");
  assert.equal(source.includes("Where am I"), true, "landing should include where-am-I guidance.");
  assert.equal(source.includes("What next"), true, "landing should include what-next guidance.");
  assert.equal(source.includes('href="/signup"'), true, "landing should keep signup route call-to-action.");
});
