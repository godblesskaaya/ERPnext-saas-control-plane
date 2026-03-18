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
    ];
  },
};

module.exports = nextConfig;
