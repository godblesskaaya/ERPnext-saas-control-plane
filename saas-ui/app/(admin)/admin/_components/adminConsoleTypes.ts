import type { Tenant } from "../../../../domains/shared/lib/types";

export type TenantAdminAction = {
  type: "suspend" | "unsuspend";
  tenant: Tenant;
  phrase: string;
};

export type AdminControlLaneLink = {
  href: string;
  label: string;
  description: string;
  hint: string;
};

