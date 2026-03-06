export type Tenant = {
  id: string;
  owner_id: string;
  subdomain: string;
  domain: string;
  site_name: string;
  company_name: string;
  plan: string;
  status: string;
  created_at: string;
  updated_at: string;
  platform_customer_id?: string | null;
};

export type Job = {
  id: string;
  tenant_id: string;
  type: string;
  status: string;
  logs: string;
  error?: string | null;
};

export type ResetAdminPasswordResult = {
  tenant_id: string;
  domain: string;
  administrator_user: string;
  admin_password: string;
  message: string;
};
