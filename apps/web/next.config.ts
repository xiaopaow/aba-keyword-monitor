import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*'],
  transpilePackages: ["@aba/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:4000"}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
