# QueueFlow Audit Report — Categories A (Auth), B (Validation), C (API Robustness)

---

## CRITICAL

### [A1] CRITICAL: Unauthenticated GET exposes all ticket PII (customerName, customerPhone, tenant data)
**File:** `src/app/api/tickets/status/route.ts:123`
**Description:** The `GET` handler is exported as a bare `async function GET(req)` without `withAuth`. Any unauthenticated caller can query `?ticketId=<any-id>` and receive the full ticket record including `customerName`, `customerPhone`, `deviceId`, tenant name, and queue details. The POST sibling is properly wrapped with `withAuth`, but GET is not.
**Fix:** Wrap the GET handler in `withAuth(...)` with appropriate roles, or at minimum require the request to pass a valid ticket lookup token/signature.

### [A2] CRITICAL: Unauthenticated tenants list leaks walletBalance to the public
**File:** `src/app/api/tenants/route.ts:7`
**Description:** `GET /api/tenants` has no `withAuth` wrapper. It returns all active tenants including `walletBalance` (a sensitive financial field) to any anonymous caller. Comment says "PUBLIC — needed for join page" but financial data should never be in the public response.
**Fix:** Add `withAuth` or create a separate public endpoint that returns only `id`, `name`, and `queueCount` without `walletBalance`.

### [A3] CRITICAL: Race condition in call-next-ticket — two agents can call the same ticket
**File:** `src/app/api/tickets/call/route.ts:38-96`
**Description:** Auto-completing the previous SERVING ticket (lines 51-66) runs in a transaction, but finding the next WAITING ticket and updating it to SERVING (lines 70-96) runs outside that transaction. Two agents hitting `/call` concurrently can both read the same next WAITING ticket and attempt to serve it, causing duplicate service or a DB unique-constraint error.
**Fix:** Wrap the entire flow (auto-complete previous + find next + mark SERVING) in a single `db.$transaction` with serializable isolation or use `findFirst` with a `where: { status: 'WAITING' }` inside the same transaction.

### [A4] CRITICAL: Race condition in skip — duplicate serial numbers under concurrency
**File:** `src/app/api/tickets/skip/route.ts:71-99`
**Description:** `queue.currentSerial` is read at line 71 *outside* the transaction, then used to compute `newSerial`. Two concurrent skip requests for different tickets in the same queue will read the same `currentSerial` value and try to set it to the same `newSerial`, causing a unique constraint violation or silent data corruption.
**Fix:** Move the `currentSerial` read inside the transaction, or use `queue.update({ data: { currentSerial: { increment: 1 } } })` within the transaction and use the returned value.

### [A5] CRITICAL: Double-refund race condition on concurrent cancel requests
**File:** `src/app/api/tickets/cancel/route.ts:47-92`
**Description:** The ticket status check (`ticket.status !== 'WAITING' && ticket.status !== 'SERVING'`) happens at line 48 *before* the transaction. Two concurrent cancel requests can both pass this check, then both execute the refund inside their respective transactions. The first transaction changes the status to CANCELLED, but the second has already captured the old status and proceeds to refund again.
**Fix:** Move the status check inside the `db.$transaction` and use a conditional update (e.g., `update ... where status IN ('WAITING','SERVING')` and check affected rows).

### [A6] CRITICAL: AGENT role bypasses tenant isolation in notification send
**File:** `src/app/api/notifications/send/route.ts:52`
**Description:** The tenant-ownership check only gates MANAGER: `if (user.role === 'MANAGER' && user.tenantId !== tenantId)`. AGENT role users are not checked at all. An authenticated agent can pass any `tenantId` and send notifications for tickets belonging to other tenants. Additionally, the ticket lookup (line 60) doesn't verify `ticket.tenantId === tenantId`.
**Fix:** Add `requireTenantId: true` to `withAuth` options, and change the check to: `if (user.tenantId !== tenantId) return 403`. Verify `ticket.tenantId === tenantId`.

---

## HIGH

### [A7] HIGH: JWT_SECRET falls back to random bytes — invalidates all tokens on restart
**File:** `src/lib/auth.ts:6`
**Description:** `process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')` generates a new random secret on every cold start/restart if the env var is missing. All existing tokens become invalid silently. In multi-instance deployments, each instance uses a different secret, so tokens verified on one instance fail on another.
**Fix:** Remove the fallback. Throw a fatal error at startup if `JWT_SECRET` is not set.

### [A8] HIGH: No IP-based rate limiting on login — brute-force across emails
**File:** `src/app/api/auth/login/route.ts:23`
**Description:** Login rate limiting is per-email only (5/min). An attacker from a single IP can attempt passwords against thousands of different email addresses without hitting any IP-level throttle. Each email gets its own independent 5-attempt bucket.
**Fix:** Add a secondary IP-based rate limit (e.g., 20 attempts per IP per minute) in addition to the per-email limit.

### [A9] HIGH: Legacy SHA-256 passwords have no salt — rainbow table vulnerable
**File:** `src/lib/auth.ts:123`
**Description:** The legacy password hash is computed as `createHash('sha256').update(plainPassword).digest('hex')` with no salt. Even though the upgrade path re-hashes to bcrypt on successful login, any legacy hashes still in the DB are trivially reversible via rainbow tables. An attacker with a DB leak can crack all legacy passwords instantly.
**Fix:** Add an admin migration script to force-rehash all remaining SHA-256 hashes (or force password resets for those users).

### [A10] HIGH: agentId parameter injection — attribute service to arbitrary user
**File:** `src/app/api/tickets/call/route.ts:12,61,94` and `src/app/api/tickets/complete/route.ts:12,62`
**Description:** Call and complete accept an optional `agentId` in the request body. It's used directly as `servedByAgent: agentId || user.userId` with no validation that `agentId` belongs to the same tenant or exists at all. An agent can attribute their service (or blame poor service times) on any other agent or user.
**Fix:** If `agentId` is provided, verify it belongs to the same tenant and has an AGENT/MANAGER role before using it. Otherwise, always use `user.userId`.

### [A11] HIGH: PLATFORM_ADMIN can view any tenant wallet without audit trail
**File:** `src/app/api/tenants/wallet/route.ts:12`
**Description:** The GET endpoint allows a PLATFORM_ADMIN to query any tenant's wallet balance, transaction history, and usage stats by passing `?tenantId=...`. No audit log is created for this read access to sensitive financial data.
**Fix:** Add an audit log entry for PLATFORM_ADMIN wallet reads, or restrict admin wallet viewing to the admin analytics dashboard.

### [A12] HIGH: In-memory rate limiter is ineffective in multi-instance / serverless deployments
**File:** `src/lib/auth.ts:47-85`
**Description:** The rate limit store is a process-local `Map`. In serverless (Vercel), Docker multi-replica, or any multi-process deployment, each instance maintains its own independent counter. An attacker's requests are distributed across instances, each seeing only a fraction of the actual traffic.
**Fix:** Use a shared rate-limit store (Redis, Upstash, or a database-backed counter).

### [A13] HIGH: x-forwarded-for header is client-spoofable for rate limiting
**File:** `src/lib/api-auth.ts:29` and `src/app/api/auth/login/route.ts:34`
**Description:** `req.headers.get('x-forwarded-for')` is used as the rate-limit key. This header is set by the first proxy and can be spoofed by clients (especially if the app is not behind a properly configured trusted proxy). An attacker can send different `X-Forwarded-For` values to get fresh rate-limit buckets.
**Fix:** Configure Next.js `trustedProxy` settings and extract IP from the right-most trusted hop, or use a middleware-level IP extraction that only reads from the trusted proxy header.

### [A14] HIGH: No rate limiting on public notification subscribe/unsubscribe
**File:** `src/app/api/notifications/subscribe/route.ts:5` and `src/app/api/notifications/unsubscribe/route.ts:5`
**Description:** Both endpoints are completely public (no `withAuth`) and have no rate limiting. An attacker can flood the `pushSubscription` table with unlimited entries or repeatedly delete/insert subscriptions, causing DB load and potential denial of service.
**Fix:** Add IP-based rate limiting and consider requiring a valid tenantId + ticketId combination for subscribe.

### [A15] HIGH: No subscription count limit per tenant/ticket
**File:** `src/app/api/notifications/subscribe/route.ts:37-44`
**Description:** There is no limit on the number of push subscriptions that can be created per `tenantId` or `ticketId`. An attacker can create millions of subscription records, exhausting database storage.
**Fix:** Add a count check before insert (e.g., max 5 subscriptions per ticket, max 1000 per tenant).

---

## MEDIUM

### [A16] MEDIUM: Platform admins have no password change endpoint
**File:** `src/app/api/auth/change-password/route.ts:12`
**Description:** The change-password route explicitly blocks platform admins: `if (user.type !== 'staff' || !user.tenantId)`. There is no alternative endpoint for platform admins to change their password. If a platform admin's password is compromised, there is no self-service recovery.
**Fix:** Extend the change-password endpoint to support platform admins (check `user.type === 'platform_admin'` as an alternative path), or create a separate admin password change endpoint.

### [A17] MEDIUM: Plan limit race condition in staff creation
**File:** `src/app/api/staff/route.ts:126-154`
**Description:** The staff count check (`db.staffUser.count`) and the subsequent `db.staffUser.create` are not in the same transaction. Two concurrent `POST /staff` requests can both read the count below the limit and both proceed to create, exceeding the plan's `maxStaff` limit.
**Fix:** Wrap the count check and create in a `db.$transaction`.

### [A18] MEDIUM: Plan limit race condition in queue creation
**File:** `src/app/api/queues/route.ts:108-130`
**Description:** Same pattern as staff: `db.queue.count` for plan limit check is not in a transaction with the subsequent `db.queue.create`. Concurrent requests can exceed `maxQueues`.
**Fix:** Wrap in `db.$transaction`.

### [B1] MEDIUM: No email format validation on registration, staff creation, or login
**File:** `src/app/api/tenants/register/route.ts:8`, `src/app/api/staff/route.ts:73`, `src/app/api/auth/login/route.ts:13`
**Description:** Email is accepted as any non-empty string. Values like `"not-an-email"`, `"@@"`, or extremely long strings are accepted. This pollutes the database and could cause downstream issues with notification sending or display.
**Fix:** Validate email with a regex (e.g., `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) or use a library like `zod` or `validator.js`.

### [B2] MEDIUM: No customerPhone format validation on queue join
**File:** `src/app/api/queues/join/route.ts:14`
**Description:** `customerPhone` is stored directly without any format validation. Invalid phone numbers cause issues when SMS notifications are implemented and could be used for injection in SMS body content (if templating is ever added).
**Fix:** Validate against a phone number regex or use a library like `libphonenumber-js`.

### [B3] MEDIUM: No input length validation on queue name, prefix, customerName
**File:** `src/app/api/queues/route.ts:63-75`, `src/app/api/queues/join/route.ts:13`
**Description:** `name`, `prefix`, `customerName`, `description` accept arbitrarily long strings. A malicious user can submit megabytes of text that get stored in the DB, potentially causing storage bloat, slow queries, or display issues on client devices.
**Fix:** Add `String.length` checks (e.g., name ≤ 100, prefix ≤ 5, customerName ≤ 200) and truncate or reject oversized input.

### [B4] MEDIUM: No validation on defaultServiceTimeSec (negative/absurd values)
**File:** `src/app/api/queues/route.ts:68,128`
**Description:** `defaultServiceTimeSec` accepts any number including negative values, zero, or extremely large values like `Number.MAX_SAFE_INTEGER`. Negative values would cause negative EWT calculations.
**Fix:** Validate `defaultServiceTimeSec` is a positive integer within a reasonable range (e.g., 10–3600 seconds).

### [B5] MEDIUM: planTier not validated against known values
**File:** `src/app/api/tenants/manage/route.ts:32`, `src/app/api/tenants/manage/route.ts:171`, `src/app/api/tenants/register/route.ts:70`
**Description:** `planTier` is accepted as any arbitrary string. Invalid tiers bypass plan-limit lookups (since `planLimit.findUnique` returns null for unknown tiers), effectively granting unlimited resources.
**Fix:** Validate planTier against an enum/list of known tiers (e.g., `['FREE', 'PRO', 'ENTERPRISE']`).

### [B6] MEDIUM: walletBalance has no upper bound or type validation on tenant creation
**File:** `src/app/api/tenants/manage/route.ts:51`
**Description:** `walletBalance` accepts any number including negative values, `Infinity`, or `NaN`. A PLATFORM_ADMIN could set a tenant's wallet to negative (debt) or to an absurdly large value.
**Fix:** Validate `walletBalance` is a non-negative finite number with a reasonable maximum (e.g., ≤ 10,000,000 cents).

### [B7] MEDIUM: Top-up amountCents not validated for type or upper bound
**File:** `src/app/api/tenants/wallet/route.ts:105`
**Description:** `amountCents` is checked for `> 0` but not validated as an integer or bounded above. Values like `0.5`, `1e20`, or `Infinity` pass the check. Non-integer amounts could cause cent-fraction accounting issues.
**Fix:** Validate `amountCents` is a positive integer (`Number.isInteger(amountCents)`) and set a reasonable maximum.

### [B8] MEDIUM: brandingConfig JSON.parse crashes on malformed stored data
**File:** `src/app/api/tenants/branding/route.ts:35`
**Description:** `JSON.parse(tenant.brandingConfig)` is called without try/catch in the GET handler. If the stored `brandingConfig` contains invalid JSON (e.g., from a DB migration error or manual edit), the endpoint throws an unhandled error returning a 500 instead of the default branding. (Note: the join endpoint at `queues/join/route.ts:170` handles this correctly with try/catch.)
**Fix:** Wrap in try/catch, falling back to default branding on parse failure (matching the pattern in `queues/join/route.ts:171`).

### [B9] MEDIUM: No brandingConfig schema validation on PUT
**File:** `src/app/api/tenants/branding/route.ts:98`
**Description:** `brandingConfig` is stored as arbitrary JSON with no schema validation. An attacker (or careless manager) could store megabytes of JSON, inject unexpected fields, or store XSS payloads in color/text fields that get rendered unsafely on client pages.
**Fix:** Validate the brandingConfig structure against a schema (e.g., allow only `primaryColor`, `secondaryColor`, `logoText`, `welcomeMessage` as strings with length/color format limits).

### [B10] MEDIUM: Pagination parameters not validated (page ≤ 0, limit = 0)
**File:** `src/app/api/admin/tenants/route.ts:9-12`, `src/app/api/tickets/status/route.ts:128-132`
**Description:** `page` is parsed with `parseInt` but not validated as ≥ 1. `page=0` causes `skip: (0-1) * limit = -limit`, which in Prisma returns an error. `limit=0` returns empty results silently. Negative values are similarly problematic.
**Fix:** Clamp `page` to ≥ 1 and `limit` to ≥ 1 after parsing.

### [B11] MEDIUM: Date parameters not validated for format
**File:** `src/app/api/tickets/status/route.ts:133-134`, `src/app/api/tenants/analytics/route.ts:13-14`
**Description:** `dateFrom` and `dateTo` query params are passed directly to `new Date()` without validation. Invalid strings like `"abc"` produce `Invalid Date` objects that silently match nothing. Malicious values like very old dates could force full table scans.
**Fix:** Validate that date strings parse to valid dates and optionally enforce a maximum lookback period (e.g., 1 year).

### [B12] MEDIUM: Status filter not validated against allowed values
**File:** `src/app/api/tickets/status/route.ts:14,44-46`
**Description:** The `status` parameter in POST is passed directly to the Prisma `where` clause without validation. While Prisma will safely parameterize it, invalid status values return a misleading 404 ("No matching ticket found") instead of a 400 validation error.
**Fix:** Validate `status` against `['WAITING', 'SERVING', 'COMPLETED', 'CANCELLED', 'SKIPPED']`.

### [B13] MEDIUM: No corporateName uniqueness check on master tenant creation
**File:** `src/app/api/admin/master-tenants/route.ts:55`
**Description:** Multiple master tenants with identical `corporateName` can be created, causing confusion in the admin UI and potential data integrity issues when associating sub-tenants.
**Fix:** Add a uniqueness check (or use a unique constraint in the schema) and return 409 on duplicate.

### [B14] MEDIUM: No input length limit on corporateName or search
**File:** `src/app/api/admin/master-tenants/route.ts:46`, `src/app/api/admin/tenants/route.ts:14`
**Description:** `corporateName` and the `search` query parameter accept arbitrarily long strings, enabling potential DoS via large string processing in DB queries.
**Fix:** Add maximum length validation (e.g., 200 characters).

---

## LOW

### [C1] LOW: PLATFORM_ADMIN GET on /staff returns all staff across all tenants with no pagination
**File:** `src/app/api/staff/route.ts:37-52`
**Description:** When a PLATFORM_ADMIN calls `GET /staff` without a `tenantId` filter, all staff users from all tenants are returned in a single unbounded query. This could return thousands of records and cause slow responses.
**Fix:** Add pagination and/or require `tenantId` for PLATFORM_ADMIN staff listing.

### [C2] LOW: Analytics N+1 query — fetches all tickets for hour bucket computation
**File:** `src/app/api/tenants/analytics/route.ts:100-105`
**Description:** All tickets matching the date range are fetched into memory just to compute hourly bucket counts. For tenants with thousands of tickets, this causes high memory usage and slow responses.
**Fix:** Use `db.ticket.groupBy({ by: ['createdAt'] })` with SQL-level date truncation, or use a raw query with `DATE_TRUNC('hour', "createdAt")`.

### [C3] LOW: Analytics avg times computed from only last 500 tickets
**File:** `src/app/api/tenants/analytics/route.ts:69`
**Description:** `take: 500` limits the completed tickets used for average wait/service time calculation. For tenants with more than 500 completed tickets in the date range, the averages are biased toward recent data without any indication to the user.
**Fix:** Use `db.ticket.aggregate({ _avg: { ... } })` for accurate averages, or document the limitation.

### [C4] LOW: Admin analytics handler ignores request/context parameters
**File:** `src/app/api/admin/analytics/route.ts:6`
**Description:** The handler is `async () => {}` (no parameters), discarding `req` and `ctx` passed by `withAuth`. If date filtering or other query params are ever needed, the handler cannot access them.
**Fix:** Accept `(req, ctx)` parameters for future extensibility.

### [C5] LOW: Delete staff uses query param instead of request body
**File:** `src/app/api/staff/route.ts:307`
**Description:** `DELETE /staff?userId=...` reads the target from query params while all other mutations use the request body. This is inconsistent and means the userId appears in server logs and proxy logs.
**Fix:** Accept userId in the request body (or path parameter) consistent with other endpoints.

### [C6] LOW: PUT /tenants used as a read operation (semantic misuse)
**File:** `src/app/api/tenants/route.ts:35`
**Description:** `PUT /api/tenants` is used to retrieve a single tenant with stats. PUT should be for updates. This confuses API consumers, breaks HTTP semantics, and may cause issues with caching proxies and middleware.
**Fix:** Move the single-tenant read to a dedicated `GET /api/tenants/[id]` route.

### [C7] LOW: Unsubscribe endpoint leaks existence information via deleted count
**File:** `src/app/api/notifications/unsubscribe/route.ts:22`
**Description:** Returns `deleted: result.count` which tells the caller whether a subscription existed (0 vs 1+). This is an information leak for a public endpoint.
**Fix:** Always return `{ success: true }` regardless of whether anything was deleted.

### [C8] LOW: Password minimum length inconsistency (6 vs 8)
**File:** `src/app/api/auth/change-password/route.ts:33` vs `src/app/api/tenants/register/route.ts:23` vs `src/app/api/staff/route.ts:102`
**Description:** Registration requires 8 characters, but change-password and staff creation require only 6. A user could create a strong password at registration, then change it to a weaker 6-character password.
**Fix:** Standardize to a consistent minimum (recommend 8) across all password entry points.

### [C9] LOW: No password complexity requirements beyond length
**File:** `src/app/api/auth/change-password/route.ts:33`, `src/app/api/tenants/register/route.ts:23`, `src/app/api/staff/route.ts:102`
**Description:** All password checks only enforce minimum length. No requirements for uppercase, lowercase, digits, or special characters. Users can set passwords like `"aaaaaaa"`.
**Fix:** Add complexity rules (e.g., at least one uppercase, one digit) or use a password strength library like `zxcvbn`.

### [C10] LOW: CSRF token functions exist but are never validated
**File:** `src/lib/auth.ts:38-44`
**Description:** `generateCsrfToken` and `verifyCsrfToken` are defined and `generateCsrfToken` is called in login and registration, but `verifyCsrfToken` is never called in any API route. The generated CSRF tokens serve no purpose. (Low risk since Bearer tokens in headers are inherently CSRF-resistant, but the dead code is misleading.)
**Fix:** Either implement CSRF validation in state-changing routes, or remove the dead code and stop generating unused CSRF tokens.

### [C11] LOW: Notification send has no event type validation
**File:** `src/app/api/notifications/send/route.ts:44`
**Description:** The `event` field is not validated against known event types (e.g., `TICKET_CALLED`, `TICKET_COMPLETED`). Arbitrary event types are accepted and stored in audit logs.
**Fix:** Validate `event` against a whitelist of known event types.

### [C12] LOW: No audit log for notification subscribe/unsubscribe
**File:** `src/app/api/notifications/subscribe/route.ts:37-44`, `src/app/api/notifications/unsubscribe/route.ts:17-19`
**Description:** Push subscription creation and deletion are not logged. If subscriptions are abused or tampered with, there is no audit trail.
**Fix:** Add audit log entries for subscription create and delete operations.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 6     |
| HIGH     | 9     |
| MEDIUM   | 14    |
| LOW      | 12    |
| **Total**| **41**|

### Top priorities (fix immediately):
1. **A1** — Unauthenticated ticket PII exposure
2. **A2** — Public tenant walletBalance leak
3. **A3/A4/A5** — Race conditions in call/skip/cancel (wrap in transactions)
4. **A6** — Agent tenant isolation bypass in notifications
5. **A7** — JWT_SECRET fallback must be removed
6. **A8** — Add IP-based login rate limiting
7. **A10** — agentId injection must validate tenant membership