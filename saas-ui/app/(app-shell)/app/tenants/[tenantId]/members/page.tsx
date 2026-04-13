import { TenantDetailScaffold, TenantSectionPlaceholder } from "../../../_components/TenantDetailScaffold";

type TenantMembersPageProps = {
  params: Promise<{
    tenantId: string;
  }>;
};

export default async function TenantMembersPage({ params }: TenantMembersPageProps) {
  const { tenantId } = await params;

  return (
    <TenantDetailScaffold
      tenantId={tenantId}
      section="members"
      title="Tenant members"
      subtitle="Identity and access management for this tenant."
    >
      <TenantSectionPlaceholder
        title="Members"
        body="This canonical page now owns tenant membership management. The detailed access and invitation workflows will move here next."
      />
    </TenantDetailScaffold>
  );
}
