export type TenantStatus =
  | "pending_payment"
  | "pending"
  | "provisioning"
  | "active"
  | "suspended"
  | "deleting"
  | "deleted"
  | "failed"
  | (string & {});

export type TenantPlan = "starter" | "business" | "enterprise" | (string & {});

export type Tenant = {
  id: string;
  owner_id: string;
  subdomain: string;
  domain: string;
  site_name: string;
  company_name: string;
  plan: TenantPlan;
  chosen_app?: string | null;
  status: TenantStatus;
  billing_status?: string;
  stripe_checkout_session_id?: string | null;
  stripe_subscription_id?: string | null;
  platform_customer_id?: string | null;
  payment_provider?: string | null;
  dpo_transaction_token?: string | null;
  created_at: string;
  updated_at: string;
};

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | (string & {});

export type Job = {
  id: string;
  tenant_id: string;
  type: string;
  status: JobStatus;
  rq_job_id?: string | null;
  logs: string;
  error?: string | null;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
};

export type TenantCreatePayload = {
  subdomain: string;
  company_name: string;
  plan: TenantPlan;
  chosen_app?: string;
};

export type TenantCreateResponse = {
  tenant: Tenant;
  job?: Job | null;
  checkout_url?: string | null;
  checkout_session_id?: string | null;
};

export type UserProfile = {
  id: string;
  email: string;
  role: string;
  email_verified: boolean;
  email_verified_at?: string | null;
  created_at: string;
};

export type SubdomainAvailability = {
  subdomain: string;
  domain?: string | null;
  available: boolean;
  reason?: "reserved" | "invalid" | "taken" | (string & {}) | null;
  message: string;
};

export type ResetAdminPasswordResult = {
  tenant_id: string;
  domain: string;
  administrator_user: string;
  admin_password: string;
  message: string;
};

export type BackupManifestEntry = {
  id?: string;
  tenant_id?: string;
  job_id?: string;
  file_path?: string;
  file_size_bytes?: number;
  created_at?: string;
  expires_at?: string | null;
  s3_key?: string | null;
  download_url?: string | null;
  [key: string]: unknown;
};

export type DeadLetterJob = {
  id: string;
  func_name: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
  enqueued_at?: string | null;
};

export type MessageResponse = {
  message: string;
};

export type OptionalEndpointResult<T> =
  | { supported: true; data: T }
  | { supported: false; data: null };
