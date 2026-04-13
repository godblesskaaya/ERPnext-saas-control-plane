import { TenantDetailScaffold, TenantSectionPlaceholder } from "../../../_components/TenantDetailScaffold";

type TenantJobsPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantJobsPage({ params }: TenantJobsPageProps) {
  const { tenantId } = await params;

  return (
    <TenantDetailScaffold
      tenantId={tenantId}
      section="jobs"
      title="Tenant jobs"
      subtitle="Jobs and execution history for this tenant."
    >
      <TenantSectionPlaceholder
        title="Jobs"
        body="This canonical page now owns tenant job history, queued work, and execution status."
      />
    </TenantDetailScaffold>
  );
}
