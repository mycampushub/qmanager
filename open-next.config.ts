// =============================================================================
// opennextjs-cloudflare Configuration
// https://opennext.js.org/cloudflare
//
// This config tells opennextjs-cloudflare how to map Next.js routes to
// Cloudflare Workers, Durable Objects, and static assets.
// =============================================================================

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // The main worker entrypoint
  main: ".open-next/worker.js",

  // Static assets served from R2 or local .open-next/assets
  assets: {
    directory: ".open-next/assets",
    binding: "ASSETS",
  },

  // Route matching
  routes: {
    // WebSocket route → Durable Object
    "/api/ws": {
      // The DO handles WebSocket upgrades directly
      override: true,
    },
  },
});