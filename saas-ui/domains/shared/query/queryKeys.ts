const tenantWorkspaceRoot = ["tenant-workspace"] as const;

export const queryKeys = {
  all: tenantWorkspaceRoot,
  workspace: (tenantSlug: string) => [...tenantWorkspaceRoot, "workspace", tenantSlug] as const,
  collection: (tenantSlug: string, resource: string) => [...tenantWorkspaceRoot, "workspace", tenantSlug, resource] as const,
  detail: (tenantSlug: string, resource: string, id: string) => [...tenantWorkspaceRoot, "workspace", tenantSlug, resource, id] as const,
};
