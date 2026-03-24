import { redirect } from "next/navigation";

export default function LegacyDashboardBillingOpsRedirectPage() {
  // AGENT-NOTE: keep legacy dashboard URLs stable while enforcing admin/user route separation.
  redirect("/admin/billing-ops");
}
