import { redirect } from "next/navigation";

export default function BillingRootPage() {
  redirect("/app/billing/invoices");
}
