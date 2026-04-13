import { redirect } from "next/navigation";

export default function AccountRootPage() {
  redirect("/app/account/profile");
}
