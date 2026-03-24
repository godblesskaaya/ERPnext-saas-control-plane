import { redirect } from "next/navigation";

export default function LegacyDashboardOnboardingRedirectPage() {
  // AGENT-NOTE: keep legacy dashboard URLs stable while enforcing admin/user route separation.
  redirect("/onboarding");
}
