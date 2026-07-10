import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  // Security headers (replaces deprecated middleware)
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|icons|favicon.ico|manifest.json|sw.js|robots.txt).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;