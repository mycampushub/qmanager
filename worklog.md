
---
Task ID: cf-build-fix-dynamic-import
Agent: Main Agent
Task: Fix Cloudflare Workers build error — Module not found: Can't resolve './local-d1'

Work Log:
- Identified root cause: `db.ts` had a static `import { getLocalD1 } from './local-d1'` which pulls in `better-sqlite3`, `fs`, `path` — Node.js-only modules that Turbopack can't bundle for CF Workers
- Rewrote `db.ts`: changed `getD1FromEnv()` from sync to async, replaced static import with dynamic `import('./local-d1')` 
- Added `better-sqlite3` to `serverExternalPackages` in `next.config.ts` so Turbopack treats it as external (no bundling)
- Updated all 62 call sites across 33 files to use `await getD1FromEnv()` (mechanical sed replace)
- Verified no un-awaited calls remain
- Verified no new lint errors introduced (all 27 lint errors are pre-existing React warnings)
- Verified `webhook-dispatch.ts` and `aggregate-tenants.ts` also updated correctly

Stage Summary:
- `src/lib/db.ts` — fully rewritten: async function, dynamic import, cached promise
- `next.config.ts` — added `better-sqlite3` to `serverExternalPackages`
- 33 files updated: all `getD1FromEnv()` calls now use `await`
- Build should now succeed on CF Workers because `./local-d1` is never statically analyzed
