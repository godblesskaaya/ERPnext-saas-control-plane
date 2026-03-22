export type TenantStatus =
  | "pending_payment"
  | "pending"
  | "provisioning"
  | "active"
  | "suspended"
  | "suspended_admin"
  | "suspended_billing"
  | "upgrading"
  | "restoring"
  | "pending_deletion"
  | "deleting"
  | "deleted"
  | "failed"
  | (string & {});

export type TenantPlan = "starter" | "business" | "enterprise" | (string & {});

export type PlanEntitlement = {
  id: string;
  plan_id: string;
  app_slug: string;
  mandatory: boolean;
  selectable: boolean;
};

export type PlanDetail = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  isolation_model: string;
  max_extra_apps?: number | null;
  monthly_price_usd_cents: number;
  monthly_price_tzs: number;
  stripe_price_id?: string | null;
  dpo_product_code?: string | null;
  backup_frequency: string;
  backup_retention_days: number;
  includes_s3_offsite_backup: boolean;
  support_channel: string;
  sla_enabled: boolean;
  custom_domain_enabled: boolean;
  created_at: string;
  updated_at: string;
  entitlements: PlanEntitlement[];
};

export type Tenant = {
  id: string;
  organization_id?: string | null;
  owner_id: string;
  subdomain: string;
  domain: string;
  site_name: string;
  company_name: string;
  plan: TenantPlan;
  chosen_app?: string | null;
  status: TenantStatus;
  billing_status?: string;
  payment_channel?: string | null;
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

export type TenantUpdatePayload = {
  plan?: TenantPlan;
  chosen_app?: string;
};

export type TenantCreateResponse = {
  tenant: Tenant;
  job?: Job | null;
  checkout_url?: string | null;
  checkout_session_id?: string | null;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

export type UserProfile = {
  id: string;
  email: string;
  phone?: string | null;
  role: string;
  email_verified: boolean;
  email_verified_at?: string | null;
  created_at: string;
};

export type AuditLogEntry = {
  id: string;
  actor_id?: string | null;
  actor_role: string;
  actor_email?: string | null;
  action: string;
  resource: string;
  resource_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type TenantMember = {
  id: string;
  tenant_id: string;
  user_id: string;
  user_email?: string | null;
  role: string;
  created_at: string;
};

export type DomainMapping = {
  id: string;
  tenant_id: string;
  domain: string;
  status: string;
  verification_token: string;
  created_at: string;
  verified_at?: string | null;
  updated_at: string;
};

export type SupportNote = {
  id: string;
  tenant_id: string;
  author_id?: string | null;
  author_role: string;
  author_email?: string | null;
  category: string;
  owner_name?: string | null;
  owner_contact?: string | null;
  sla_due_at?: string | null;
  status?: string | null;
  resolved_at?: string | null;
  sla_state?: string | null;
  sla_last_evaluated_at?: string | null;
  note: string;
  created_at: string;
  updated_at: string;
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

export type BillingPortalResponse = {
  url: string;
};

export type ImpersonationLink = {
  token: string;
  url: string;
  expires_at: string;
  target_user_id: string;
  target_email: string;
};

export type NotificationItem = {
  id: string;
  type: "success" | "warning" | "error" | "info";
  title: string;
  body: string;
  created_at: string;
  read: boolean;
};

export type BillingInvoice = {
  id: string;
  status?: string | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  collection_method?: string | null;
  payment_method_types?: string[] | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  created_at?: string | null;
};

export type BillingInvoiceListResponse = {
  invoices: BillingInvoice[];
};

export type MetricsSummary = {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  failed_tenants: number;
  provisioning_tenants: number;
  pending_payment_tenants: number;
  jobs_last_24h: number;
  provisioning_success_rate_7d: number;
  dead_letter_count: number;
  support_open_notes: number;
  support_breached_notes: number;
  support_due_soon_notes: number;
};

export type TenantSummary = {
  tenant_id: string;
  last_job?: Job | null;
  last_backup?: BackupManifestEntry | null;
  last_audit?: AuditLogEntry | null;
  last_invoice?: BillingInvoice | null;
};

export type TenantSubscription = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: "pending" | "trialing" | "active" | "past_due" | "cancelled" | "paused" | (string & {});
  trial_ends_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancelled_at?: string | null;
  selected_app?: string | null;
  payment_provider?: string | null;
  provider_subscription_id?: string | null;
  provider_customer_id?: string | null;
  provider_checkout_session_id?: string | null;
  created_at: string;
  updated_at: string;
  plan: PlanDetail;
};

export type TenantReadiness = {
  ready: boolean;
  message: string;
};

export type DunningItem = {
  tenant_id: string;
  tenant_name: string;
  domain: string;
  status: string;
  billing_status?: string | null;
  payment_channel?: string | null;
  next_retry_at?: string | null;
  grace_ends_at?: string | null;
  last_invoice_id?: string | null;
  last_payment_attempt?: string | null;
};

export type OptionalEndpointResult<T> =
  | { supported: true; data: T }
  | { supported: false; data: null };
