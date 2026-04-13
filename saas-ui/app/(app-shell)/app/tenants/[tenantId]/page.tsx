import { redirect } from "next/navigation";

type TenantRootPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantRootPage({ params }: TenantRootPageProps) {
  const { tenantId } = await params;
  redirect(`/app/tenants/${tenantId}/overview`);
}
