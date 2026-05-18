import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships a native libvips binary; keep it out of webpack's bundling pass so
  // Vercel loads it directly from node_modules at runtime.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
