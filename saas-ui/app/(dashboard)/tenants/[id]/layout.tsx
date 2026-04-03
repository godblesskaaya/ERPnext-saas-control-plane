import type { ReactNode } from "react";
import { Box } from "@mui/material";

import { TenantEntityNav } from "../../../../domains/tenant-ops/ui/tenant-detail/TenantEntityNav";

type TenantDetailShellLayoutProps = {
  children: ReactNode;
  params: Promise<{
    id: string;
  }>;
};

export default async function TenantDetailShellLayout({ children, params }: TenantDetailShellLayoutProps) {
  const { id } = await params;

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TenantEntityNav id={id} />
      {children}
    </Box>
  );
}
