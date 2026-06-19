import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "drizzle-orm"],
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["192.168.1.18"],
};

export default nextConfig;
