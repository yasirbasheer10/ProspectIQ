import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma client must run server-side only
  serverExternalPackages: ["@prisma/client", "prisma"],
  // Environment variables available at build time
  env: {
    DEMO_MODE: process.env.DEMO_MODE ?? "true",
  },
};

export default nextConfig;
