import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: For Cloudflare Workers deployment via opennextjs-cloudflare,
  // "standalone" output is NOT used. The adapter handles the build.
  // Keep "standalone" for local dev / Docker deployments.
  output: "standalone",

  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: false,

  // Allow preview panel cross-origin requests
  allowedDevOrigins: ['https://*.space-z.ai'],

  // Exclude server-only modules from client bundles.
  // better-sqlite3 is listed here so the bundler does NOT try to bundle
  // the native addon when analyzing the dynamic import in db.ts.
  serverExternalPackages: [
    'jose',
    'bcryptjs',
    'better-sqlite3',
  ],

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;