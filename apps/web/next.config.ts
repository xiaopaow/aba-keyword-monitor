import type { NextConfig } from "next";
import os from "node:os";

function getAllowedDevOrigins() {
  const origins = new Set(["localhost:3000", "127.0.0.1:3000"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        origins.add(entry.address);
        origins.add(`${entry.address}:3000`);
        origins.add(`http://${entry.address}`);
        origins.add(`http://${entry.address}:3000`);
      }
    }
  }
  return [...origins];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
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
