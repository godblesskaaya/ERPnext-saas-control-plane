import { redirect } from "next/navigation";

export default function LegacyDashboardProvisioningRedirectPage() {
  // AGENT-NOTE: keep legacy dashboard URLs stable while enforcing admin/user route separation.
  redirect("/admin/provisioning");
}
