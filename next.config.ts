import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  typescript: {
    ignoreBuildErrors: false,
  },

  reactStrictMode: false,

  // Allow preview panel cross-origin requests
  allowedDevOrigins: ['https://*.space-z.ai'],

  // Exclude server-only modules from client bundles.
  serverExternalPackages: [
    'jose',
    'bcryptjs',
  ],
};

export default nextConfig;