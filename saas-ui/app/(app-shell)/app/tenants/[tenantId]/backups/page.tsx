import { TenantDetailScaffold, TenantSectionPlaceholder } from "../../../_components/TenantDetailScaffold";

type TenantBackupsPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantBackupsPage({ params }: TenantBackupsPageProps) {
  const { tenantId } = await params;

  return (
    <TenantDetailScaffold
      tenantId={tenantId}
      section="backups"
      title="Tenant backups"
      subtitle="Recovery and backup visibility for this tenant."
    >
      <TenantSectionPlaceholder
        title="Backups"
        body="This canonical page now owns backup visibility and restore planning for the tenant."
      />
    </TenantDetailScaffold>
  );
}
