/** @type {import('next').NextConfig} */
const apiProxyTarget = process.env.API_PROXY_TARGET || "http://api:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/auth",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/auth/:path*",
        destination: "/:path*",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/app/overview",
        permanent: false,
      },
      {
        source: "/dashboard/overview",
        destination: "/app/overview",
        permanent: false,
      },
      {
        source: "/dashboard/activity",
        destination: "/app/overview/activity",
        permanent: false,
      },
      {
        source: "/dashboard/registry",
        destination: "/app/tenants",
        permanent: false,
      },
      {
        source: "/dashboard/active",
        destination: "/app/tenants/active",
        permanent: false,
      },
      {
        source: "/dashboard/suspensions",
        destination: "/app/tenants/suspensions",
        permanent: false,
      },
      {
        source: "/dashboard/billing",
        destination: "/app/billing/invoices",
        permanent: false,
      },
      {
        source: "/dashboard/billing-details",
        destination: "/app/billing/invoices",
        permanent: false,
      },
      {
        source: "/dashboard/billing-recovery",
        destination: "/app/billing/recovery",
        permanent: false,
      },
      {
        source: "/dashboard/billing-ops",
        destination: "/app/billing/recovery",
        permanent: false,
      },
      {
        source: "/dashboard/audit",
        destination: "/app/overview/activity",
        permanent: false,
      },
      {
        source: "/dashboard/support",
        destination: "/app/support/queue",
        permanent: false,
      },
      {
        source: "/dashboard/support-overview",
        destination: "/app/support/escalations",
        permanent: false,
      },
      {
        source: "/dashboard/platform-health",
        destination: "/app/platform/health",
        permanent: false,
      },
      {
        source: "/dashboard/provisioning",
        destination: "/app/platform/provisioning",
        permanent: false,
      },
      {
        source: "/dashboard/incidents",
        destination: "/app/platform/incidents",
        permanent: false,
      },
      {
        source: "/dashboard/onboarding",
        destination: "/app/platform/onboarding",
        permanent: false,
      },
      {
        source: "/dashboard/account",
        destination: "/app/account/profile",
        permanent: false,
      },
      {
        source: "/dashboard/settings",
        destination: "/app/account/settings",
        permanent: false,
      },
      {
        source: "/billing",
        destination: "/app/billing/invoices",
        permanent: false,
      },
      {
        source: "/onboarding",
        destination: "/app/platform/onboarding",
        permanent: false,
      },
      {
        source: "/tenants",
        destination: "/app/tenants",
        permanent: false,
      },
      {
        source: "/tenants/:tenantId",
        destination: "/app/tenants/:tenantId/overview",
        permanent: false,
      },
      {
        source: "/tenants/:tenantId/:tab(overview|members|domains|billing|jobs|audit|backups|support)",
        destination: "/app/tenants/:tenantId/:tab",
        permanent: false,
      },
      {
        source: "/admin/control/overview",
        destination: "/app/admin/control-overview",
        permanent: false,
      },
      {
        source: "/admin/control/tenants",
        destination: "/app/admin/tenant-control",
        permanent: false,
      },
      {
        source: "/admin/control/jobs",
        destination: "/app/admin/jobs",
        permanent: false,
      },
      {
        source: "/admin/control/audit",
        destination: "/app/admin/audit",
        permanent: false,
      },
      {
        source: "/admin/control/support",
        destination: "/app/admin/support-tools",
        permanent: false,
      },
      {
        source: "/admin/control/recovery",
        destination: "/app/admin/recovery",
        permanent: false,
      },
      {
        source: "/admin/billing-ops",
        destination: "/app/admin/billing-ops",
        permanent: false,
      },
      {
        source: "/admin/audit",
        destination: "/app/admin/audit",
        permanent: false,
      },
      {
        source: "/admin/support",
        destination: "/app/admin/support-tools",
        permanent: false,
      },
      {
        source: "/admin/support-overview",
        destination: "/app/admin/support-tools",
        permanent: false,
      },
      {
        source: "/admin/billing",
        destination: "/app/admin/billing-ops",
        permanent: false,
      },
      // AGENT-NOTE: Legacy `/admin/*` pages below do not yet have one-to-one canonical
      // `/app/admin/*` replacements. We redirect each path to the closest operator workflow
      // so bookmarked/admin-shared links remain functional during incremental migration.
      {
        source: "/admin/activity",
        destination: "/app/admin/jobs",
        permanent: false,
      },
      {
        source: "/admin/incidents",
        destination: "/app/admin/recovery",
        permanent: false,
      },
      {
        source: "/admin/provisioning",
        destination: "/app/admin/jobs",
        permanent: false,
      },
      {
        source: "/admin/onboarding",
        destination: "/app/admin/tenant-control",
        permanent: false,
      },
      {
        source: "/admin/suspensions",
        destination: "/app/admin/tenant-control",
        permanent: false,
      },
      {
        source: "/admin/platform-health",
        destination: "/app/admin/platform-health",
        permanent: false,
      },
      {
        source: "/admin",
        has: [{ type: "query", key: "view", value: "overview" }],
        destination: "/app/admin/control-overview",
        permanent: false,
      },
      {
        source: "/admin",
        has: [{ type: "query", key: "view", value: "tenants" }],
        destination: "/app/admin/tenant-control",
        permanent: false,
      },
      {
        source: "/admin",
        has: [{ type: "query", key: "view", value: "jobs" }],
        destination: "/app/admin/jobs",
        permanent: false,
      },
      {
        source: "/admin",
        has: [{ type: "query", key: "view", value: "audit" }],
        destination: "/app/admin/audit",
        permanent: false,
      },
      {
        source: "/admin",
        has: [{ type: "query", key: "view", value: "support" }],
        destination: "/app/admin/support-tools",
        permanent: false,
      },
      {
        source: "/admin",
        has: [{ type: "query", key: "view", value: "recovery" }],
        destination: "/app/admin/recovery",
        permanent: false,
      },
      {
        source: "/admin",
        destination: "/app/admin/control-overview",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
