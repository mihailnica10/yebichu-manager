import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "drizzle-orm"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
