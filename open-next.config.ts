// =============================================================================
// opennextjs-cloudflare Configuration
// https://opennext.js.org/cloudflare
// =============================================================================

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  main: ".open-next/worker.js",

  assets: {
    directory: ".open-next/assets",
    binding: "ASSETS",
  },
});