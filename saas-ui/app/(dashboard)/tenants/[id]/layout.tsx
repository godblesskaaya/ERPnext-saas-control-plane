import type { ReactNode } from "react";
import { Box } from "@mui/material";

import { TenantEntityNav } from "../../../../domains/tenant-ops/ui/tenant-detail/TenantEntityNav";

type TenantDetailShellLayoutProps = {
  children: ReactNode;
  params: {
    id: string;
  };
};

export default function TenantDetailShellLayout({ children, params }: TenantDetailShellLayoutProps) {
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TenantEntityNav id={params.id} />
      {children}
    </Box>
  );
}
