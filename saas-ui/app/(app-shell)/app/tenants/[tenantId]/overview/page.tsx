import { TenantOverviewScaffold } from "../../../_components/TenantDetailScaffold";

type TenantOverviewPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantOverviewPage({ params }: TenantOverviewPageProps) {
  const { tenantId } = await params;

  return <TenantOverviewScaffold tenantId={tenantId} />;
}
