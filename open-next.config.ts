// open-next.config.ts — No R2 cache (D1/KV only)
import { defineCloudflareConfig, initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Initialize Cloudflare context for local dev (wrangler provides D1/KV/R2 bindings)
initOpenNextCloudflareForDev();

export default defineCloudflareConfig({});