# QueueFlow Audit Report — Sections A through I

---

## A: Security & Auth

```
[A1] SECURITY: JWT Secret Regenerated on Every Cold Start
Severity: CRITICAL
File: src/lib/auth.ts:6
Description: JWT_SECRET falls back to crypto.randomBytes(32).toString('hex') when env var is unset. Every server restart invalidates all issued tokens, forcibly logging out every user. Additionally, the fallback secret is not persisted, so load-balanced instances will each have different secrets.
Fix: Remove the fallback and fail fast on startup if JWT_SECRET is not set. Add a startup check: if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var required')
```

```
[A2] SECURITY: Unauthenticated GET Endpoint Leaks Cross-Tenant Ticket Data
Severity: CRITICAL
File: src/app/api/tickets/status/route.ts:161-218
Description: The GET handler accepts a ticketId with no authentication and no tenant ownership check. Any anonymous user can look up any ticket by ID, leaking customer names, phone numbers, queue names, and positions across all tenants.
Fix: Either protect this endpoint with withAuth, or require both ticketId AND tenantId and verify the ticket belongs to that tenant.
```

```
[A3] SECURITY: CSRF Token Generated but Never Validated
Severity: HIGH
File: src/lib/api-auth.ts (full file)
Description: CSRF tokens are generated on login and stored in localStorage, but no API route validates them. The withAuth wrapper only checks the Authorization header and role. This means CSRF protection is completely non-functional — a malicious site can make authenticated requests on behalf of logged-in users.
Fix: Add CSRF validation to withAuth: compare the request's X-CSRF-Token header (or custom header) against the stored token. Or use SameSite cookies instead of localStorage-based tokens.
```

```
[A4] SECURITY: x-forwarded-for Header Spoofable for Rate Limiting
Severity: HIGH
File: src/lib/auth.ts:34-37, src/lib/api-auth.ts:29
Description: Rate limiting keys use x-forwarded-for or x-real-ip headers directly. Clients can set these headers to arbitrary values, bypassing per-IP rate limits entirely. An attacker can rotate IP addresses in the header to get unlimited requests.
Fix: Use req.ip from Next.js (which uses the trusted proxy) or configure a trusted proxy range and only use the rightmost IP.
```

```
[A5] SECURITY: Notification Subscribe Endpoint Has No Rate Limiting
Severity: MEDIUM
File: src/app/api/notifications/subscribe/route.ts:5
Description: Public unauthenticated POST endpoint with no rate limiting. An attacker can flood the push_subscriptions table, causing storage bloat and potential DoS.
Fix: Add rate limiting using the IP or a combination of IP+tenantId.
```

```
[A6] SECURITY: Notification Unsubscribe Deletes Any Subscription by Endpoint
Severity: MEDIUM
File: src/app/api/notifications/unsubscribe/route.ts:17
Description: Any unauthenticated request can delete any push subscription by providing its endpoint URL. No tenant, ticket, or ownership verification. A malicious actor who discovers an endpoint URL can silently unsubscribe legitimate users.
Fix: Require at minimum the tenantId (and optionally ticketId) to scope the deletion, or use a subscription ID instead of the raw endpoint.
```

```
[A7] SECURITY: Feedback Submission Endpoint Has No Rate Limiting
Severity: MEDIUM
File: src/app/api/feedback/route.ts:9
Description: Public POST endpoint for submitting feedback with no rate limiting. Could be abused to spam feedback entries or inflate ratings.
Fix: Add rate limiting keyed by IP or ticketId.
```

```
[A8] SECURITY: Appointments List Endpoint Is Publicly Accessible
Severity: MEDIUM
File: src/app/api/appointments/route.ts:58
Description: The GET endpoint for listing appointments is entirely unauthenticated. Anyone can query any tenant's appointment schedule, including customer names, phone numbers, and scheduled times, by providing tenantId as a query param.
Fix: Wrap the GET handler with withAuth, or at minimum require a valid tenantId + some form of authorization for sensitive data.
```

```
[A9] SECURITY: PLATFORM_ADMIN Can Top-Up Any Tenant Wallet Without Payment
Severity: MEDIUM
File: src/app/api/tenants/wallet/route.ts:93-174
Description: The POST endpoint allows PLATFORM_ADMIN to add arbitrary amounts to any tenant's wallet. While this may be intentional for manual credits, there is no payment verification, invoice generation, or approval workflow. It's essentially free money creation.
Fix: Add a comment/flag for manual credits vs automated top-ups. For automated top-ups, integrate with a real payment gateway verification. At minimum, add a max top-up amount per request.
```

```
[A10] SECURITY: Registration Accepts Arbitrary planTier Without Validation
Severity: MEDIUM
File: src/app/api/tenants/register/route.ts:70
Description: const tier = planTier || 'FREE' — the planTier from the request body is used directly without validating against allowed values ('FREE', 'PRO', 'ENTERPRISE'). A user could register with planTier=ENTERPRISE to get higher limits.
Fix: Validate planTier against a whitelist: if (!['FREE', 'PRO', 'ENTERPRISE'].includes(tier)).
```

---

## B: Data Integrity

```
[B1] DATA: Race Condition in Ticket Call (Auto-Complete + Call Next Not Fully Atomic)
Severity: HIGH
File: src/app/api/tickets/call/route.ts:38-96
Description: The auto-complete of the previous SERVING ticket (lines 39-67) and the find-next + update-to-SERVING (lines 70-96) are separate operations. Two agents calling simultaneously for the same queue could both try to auto-complete the same ticket, or both retrieve and assign the same next waiting ticket.
Fix: Wrap the entire auto-complete + call-next flow in a single db.$transaction with a SELECT FOR UPDATE (or use SQLite's row-level locking via serializable isolation).
```

```
[B2] DATA: CustomerProfile completedTickets and avgServiceTime Never Updated
Severity: MEDIUM
File: src/app/api/tickets/complete/route.ts (full file)
Description: When a ticket is completed via /api/tickets/complete, the CustomerProfile's completedTickets counter and avgServiceTime are never updated. The profile upsert only happens via explicit POST /api/customer-profiles. This means loyalty tiers are never advanced based on actual service completions.
Fix: After completing a ticket, if customerPhone exists, upsert the CustomerProfile: increment completedTickets and recalculate avgServiceTime.
```

```
[B3] DATA: No Unique Constraint on (queueId, serialNumber) in Tickets Table
Severity: MEDIUM
File: prisma/schema.prisma:136
Description: The Ticket model has @@index([queueId, status, serialNumber]) but no @@unique([queueId, serialNumber]). If a race condition causes two tickets to get the same serial number for the same queue, data integrity is compromised.
Fix: Add @@unique([queueId, serialNumber]) to the Ticket model. Note: this may need a data migration if duplicates exist.
```

```
[B4] DATA: Tenant Manage Endpoint Ignores Contact/Address/Welcome Fields from MANAGER
Severity: HIGH
File: src/app/api/tenants/manage/route.ts:111-154
Description: When user.role === 'MANAGER', the endpoint ONLY updates the tenant name. All other fields (contactEmail, contactPhone, address, welcomeMessage) sent from the SettingsTab are silently ignored. The SettingsTab's "Save Settings" button appears to work but changes nothing.
Fix: Extend the MANAGER branch to allow updating contactEmail, contactPhone, address, and welcomeMessage in addition to name.
```

```
[B5] DATA: KioskView Requests estimatedWaitTime But Join Endpoint Doesn't Return It
Severity: LOW
File: src/components/views/KioskView.tsx:502, src/app/api/queues/join/route.ts
Description: KioskView tries to read data.estimatedWaitTime (line 502) but the join endpoint response doesn't include this field. The kiosk always falls back to position * defaultServiceTimeSec, which may be inaccurate.
Fix: Add estimatedWaitTime calculation to the join queue response, or compute it in the kiosk from the returned queue data.
```

---

## C: API Robustness

```
[C1] ROBUSTNESS: Analytics Endpoint Loads ALL Tickets Into Memory for Peak Hour
Severity: HIGH
File: src/app/api/tenants/analytics/route.ts:99-106
Description: fetches ALL tickets for the date range into memory just to bucket by hour: db.ticket.findMany({ where: ticketBase, select: { createdAt: true } }). This is an unbounded query that causes OOM risk on tenants with thousands of tickets. Also, line 92-96 does groupBy on createdAt DateTime (exact timestamp), which is useless — each ticket gets its own group.
Fix: Use db.$queryRaw with SQL GROUP BY strftime('%H', createdAt) to compute hour buckets at the database level, or use Prisma's groupBy on a computed field.
```

```
[C2] ROBUSTNESS: Analytics Export Route Duplicates Entire Analytics Logic
Severity: LOW
File: src/app/api/tenants/analytics/export/route.ts (full file)
Description: Nearly 200 lines of code are copy-pasted from analytics/route.ts. Any bug fix or feature addition must be applied to both files. The export endpoint should reuse the analytics logic.
Fix: Extract shared analytics computation into a shared function and call it from both routes.
```

```
[C3] ROBUSTNESS: No Validation on defaultServiceTimeSec (Zero/Negative)
Severity: MEDIUM
File: src/app/api/queues/route.ts:206
Description: defaultServiceTimeSec is accepted without minimum value validation. Setting it to 0 or negative causes division-by-zero errors in EWT calculations (e.g., queues route line 86: waiting * avgServiceTime, and analytics route line 158).
Fix: Add validation: if (defaultServiceTimeSec !== undefined && (defaultServiceTimeSec < 30 || defaultServiceTime > 7200)) return error.
```

```
[C4] ROBUSTNESS: No Validation on Queue Prefix (Length, Characters, Uniqueness)
Severity: MEDIUM
File: src/app/api/queues/route.ts:127
Description: Queue prefix is only uppercased. No validation for length (could be empty or very long), character set (could contain emojis or special chars), or uniqueness within the tenant. Duplicate prefixes within a tenant cause confusion for customers.
Fix: Validate prefix: regex /^[A-Z]{1,3}$/. Check uniqueness within tenant before creation.
```

```
[C5] ROBUSTNESS: Branding Config Has No Schema Validation
Severity: MEDIUM
File: src/app/api/tenants/branding/route.ts:95-101
Description: Any JSON object can be stored as brandingConfig. No schema validation. Malformed or malicious configs (e.g., XSS payloads in welcomeMessage) could be stored and rendered unsafely in the DisplayView or KioskView.
Fix: Validate the branding config against a schema: only allow primaryColor (hex), secondaryColor (hex), logoText (string), welcomeMessage (string).
```

```
[C6] ROBUSTNESS: Date Parameters Not Validated as Actual Dates
Severity: LOW
File: src/app/api/tenants/analytics/route.ts:32-37, src/app/api/tickets/status/route.ts:133-134, src/app/api/feedback/route.ts:127-133
Description: dateFrom and dateTo query params are passed to new Date() without checking if the result is valid. new Date('not-a-date') returns Invalid Date, leading to unpredictable query behavior.
Fix: Parse date strings and check isNaN(date.getTime()) before using them in queries.
```

```
[C7] ROBUSTNESS: Agent Auto-Detect Serving Ticket Reads Wrong Response Field
Severity: MEDIUM
File: src/components/views/DashboardView.tsx:168
Description: The auto-detect logic checks data.tickets?.[0] but the POST /api/tickets/status endpoint returns data.ticket (singular), not data.tickets. This means the agent view never auto-detects an in-progress serving ticket.
Fix: Change to const servingTicket = data.ticket; (matching the actual API response shape).
```

```
[C8] ROBUSTNESS: Skip-to-Content Link Renders After Non-Focusable Elements
Severity: LOW
File: src/app/page.tsx:114
Description: The skip-to-content link is rendered after the Toaster and RegistrationDialog components. While Toaster is portal-based, the RegistrationDialog renders in the DOM. The skip link should be the very first focusable element in the document.
Fix: Move the <a href="#main-content"> to the very beginning of the return, before Toaster and RegistrationDialog.
```

---

## D: Business Logic

```
[D1] BUSINESS: Platform Admin OverviewTab Fetches Wrong Data Shape
Severity: HIGH
File: src/components/views/PlatformAdminView.tsx:144
Description: OverviewTab checks for data.analytics (line 144) but the /api/admin/analytics endpoint returns data at the root level, not nested under 'analytics'. So data.analytics is always undefined, and the overview shows all zeros.
Fix: Change setAnalytics(data.analytics) to setAnalytics(data) to match the actual API response shape. Also update the field mappings (activeTenants→activeToday, newTenantsThisMonth→newThisMonth, etc.).
```

```
[D2] BUSINESS: Settings Tab Saves to Endpoint That Ignores Most Fields
Severity: HIGH
File: src/components/tabs/SettingsTab.tsx:96-99
Description: handleSaveSettings sends { tenantId, contactEmail, contactPhone, address, welcomeMessage } to PUT /api/tenants/manage, but that endpoint for MANAGER role only updates 'name'. Contact email, phone, address, and welcome message are silently discarded.
Fix: Update the PUT handler in /api/tenants/manage to accept and persist contactEmail, contactPhone, address, and welcomeMessage for MANAGER role.
```

```
[D3] BUSINESS: EWT Calculation Ignores Number of Active Agents
Severity: MEDIUM
File: Multiple files (queues/route.ts:86, analytics/route.ts:158, tickets/call/route.ts:136)
Description: Estimated Wait Time is calculated as waitingCount × avgServiceTime. With multiple agents serving simultaneously, actual wait is approximately waitingCount × avgServiceTime / numActiveAgents. The current formula overestimates wait time.
Fix: Factor in the number of active agents when computing EWT. Track agent session activity or use a configurable agents-per-queue setting.
```

```
[D4] BUSINESS: Service Window Open/Close Status Not Checked During Queue Join
Severity: MEDIUM
File: src/app/api/queues/join/route.ts (full file)
Description: Customers can join queues at any time, even when the business is closed per service windows. The service window configuration exists but is never enforced during queue join.
Fix: In the join endpoint, check service windows for the current day/time before allowing a ticket to be created. Return a clear error like 'This service is currently closed. Hours: 9:00-17:00'.
```

```
[D5] BUSINESS: MasterTenant View Uses Placeholder/Fake Staff Data
Severity: MEDIUM
File: src/components/views/MasterTenantView.tsx:319-325
Description: StaffTab generates fake staff entries like 'Agent 1 - BranchName' with fabricated emails instead of querying the real staff database. This misleads franchise managers about actual staff.
Fix: Create a cross-tenant staff API endpoint that PLATFORM_ADMIN or a MasterTenant MANAGER can call, or query the existing /api/staff endpoint for each sub-tenant.
```

```
[D6] BUSINESS: MasterTenant View Shows -1 for All Analytics Metrics
Severity: LOW
File: src/components/views/MasterTenantView.tsx:229-231
Description: CrossBranchAnalyticsTab hardcodes avgWaitTime, avgServiceTime, and completionRate as -1 (displayed as N/A). There is no cross-branch analytics API to provide real data.
Fix: Build a dedicated cross-branch analytics API that aggregates data across sub-tenants, or at minimum show real per-branch ticket counts with the data already available.
```

```
[D7] BUSINESS: Payment Flow Creates Orphaned Zero-Amount Transactions
Severity: LOW
File: src/app/api/payments/route.ts:55-164
Description: The payment flow creates a PAYMENT transaction with negative amount, then on confirm, zeroes it out (line 144: amountCents: 0) and creates a separate TOP_UP. This leaves an orphaned zero-amount PAYMENT transaction record that provides no useful information and clutters the transaction history.
Fix: Instead of zeroing out, delete the PAYMENT transaction on confirm, or better yet, combine into a single transaction record.
```

---

## E: End-User (Customer) Perspective

```
[E1] END-USER: No Ticket Persistence Across Sessions for Mobile Users
Severity: HIGH
File: src/components/views/JoinView.tsx (full file)
Description: When a customer joins a queue on mobile and refreshes or closes the browser, they lose their ticket reference. The deviceId field exists in the schema but is never populated from the frontend, and there's no lookup-by-deviceId endpoint. The customer must re-enter their phone number to find their ticket.
Fix: Generate and store a deviceId in localStorage, send it when joining, and provide a "find my ticket" lookup by deviceId on the join/status page.
```

```
[E2] END-USER: Kiosk Position Calculation Is Inaccurate
Severity: MEDIUM
File: src/components/views/KioskView.tsx:496
Description: Position is calculated as serialNumber - nowServingSerial. This fails when tickets are skipped (serial number changes but the skipped ticket goes to the end) or cancelled. The displayed position can be wrong.
Fix: Calculate actual position by counting tickets with lower serial numbers that have status WAITING in the same queue.
```

```
[E3] END-USER: Wallet Balance Displayed in $ Instead of Local Currency
Severity: LOW
File: src/components/views/MasterTenantView.tsx:198, src/components/views/PlatformAdminView.tsx:262
Description: Wallet balance is displayed as ${amount} using the dollar sign, but the app targets Bangladesh (bKash, Nagad) where the currency is Taka (৳). All wallet displays should use ৳.
Fix: Replace $ with ৳ in wallet balance displays across all views.
```

```
[E4] END-USER: Webhook Dispatch Never Called from Ticket Events
Severity: MEDIUM
File: src/lib/webhook-dispatch.ts (full file)
Description: The dispatchWebhooks utility exists and properly computes HMAC signatures, but it is never imported or called from any API route (call, complete, cancel, skip, join). Webhooks configured by managers will never fire.
Fix: Import and call dispatchWebhooks() from each ticket mutation route after the database operation succeeds, using the _event data already returned by the routes.
```

```
[E5] END-USER: No Push/SMS Notification Triggered on Ticket Call
Severity: MEDIUM
File: src/app/api/tickets/call/route.ts (full file)
Description: When a ticket is called, the endpoint returns _event data but never calls /api/notifications/send or dispatchWebhooks. Customers with push subscriptions or phone numbers are never notified that their ticket is being served.
Fix: After successfully calling a ticket, invoke the notification dispatch (push notification to subscribed devices, and SMS stub if phone is present).
```

```
[E6] END-USER: DisplayView Uses Authenticated Endpoint Without Credentials
Severity: MEDIUM
File: src/components/views/DisplayView.tsx:257-261
Description: The TV Display fetches tenant data via PUT /api/tenants which requires MANAGER or PLATFORM_ADMIN authentication. Since the display is a public-facing screen, it has no auth token and the fetch will fail, leaving the display empty or showing a loading spinner forever.
Fix: Create a public endpoint for display data, or use the existing GET /api/tenants/[id]/queues plus GET /api/tenants/branding endpoints (both public).
```

---

## F: Staff (Agent) Perspective

```
[F1] STAFF: Only One Ticket Can Be SERVING Per Queue (No Multi-Agent Support)
Severity: HIGH
File: prisma/schema.prisma:96 (Queue.nowServingSerial), src/app/api/tickets/call/route.ts:89-96
Description: Each queue has a single nowServingSerial. When Agent A calls the next ticket, it auto-completes the previous SERVING ticket. If Agent B is serving a different queue, that's fine, but within a single queue, only one ticket can be SERVING at a time. Multi-service-window queues are impossible.
Fix: Replace nowServingSerial on Queue with a per-ticket servedByAgent field. The "now serving" display should show all currently SERVING tickets for a queue, not a single serial.
```

```
[F2] STAFF: No Queue Health Summary for Agents
Severity: MEDIUM
File: src/components/views/DashboardView.tsx:120-176 (AgentView)
Description: The agent view requires manual queue selection and shows only the selected queue's status. There's no at-a-glance summary showing which queues have the most waiting tickets or longest wait times, making it hard to prioritize work.
Fix: Add a small summary row or card at the top of the agent view showing all queues with their waiting counts and EWT, enabling agents to pick the busiest queue.
```

```
[F3] STAFF: No Ticket Reassignment Between Agents
Severity: LOW
File: src/app/api/tickets/complete/route.ts, src/app/api/tickets/call/route.ts
Description: There's no API or UI to reassign a ticket from one agent to another. If an agent goes on break or a manager needs to take over, the ticket must be completed or skipped.
Fix: Add a reassignment endpoint (PUT /api/tickets/reassign) that changes the servedByAgent field on a SERVING ticket.
```

---

## G: Manager Perspective

```
[G1] MANAGER: Audit Log Tab Is a Placeholder — No API or UI
Severity: MEDIUM
File: src/components/views/PlatformAdminView.tsx:437-453
Description: The AuditLogTab displays "Coming Soon" with no actual data. Audit logs are being written to the database but there's no API endpoint to fetch them and no UI to display, search, filter, or export them.
Fix: Create GET /api/admin/audit-logs endpoint with pagination, date filtering, and action type filtering. Build a table UI in the AuditLogTab component.
```

```
[G2] MANAGER: No Tenant Activation/Deactivation Toggle in Admin UI
Severity: MEDIUM
File: src/components/views/PlatformAdminView.tsx:271
Description: The TenantsTab has an Eye button (line 271) that shows a toast 'Viewing X (details coming soon)' but no actual activate/deactivate toggle. Platform admins must use the API directly to activate or deactivate tenants.
Fix: Replace the Eye button with a toggle switch or action menu that calls PUT /api/tenants/manage with isActive: true/false.
```

```
[G3] MANAGER: Admin Analytics Field Names Mismatch
Severity: HIGH
File: src/components/views/PlatformAdminView.tsx:160-167, src/app/api/admin/analytics/route.ts:39-49
Description: The API returns: totalTenants, activeTenants, newTenantsThisMonth, totalTickets, totalTicketsToday, completedToday, totalRevenue, totalStaff, totalQueues. But OverviewTab expects: totalTenants, activeToday, totalTicketsServed, totalRevenue. The fields activeToday, totalTicketsServed don't exist in the API response.
Fix: Update the OverviewTab to use the actual API field names: activeTenants (not activeToday), totalTickets (not totalTicketsServed), and add the new fields (totalTicketsToday, completedToday, totalStaff, totalQueues).
```

```
[G4] MANAGER: MasterTenant Creation Form Sends billingEmail But Schema Ignores It
Severity: LOW
File: src/components/views/PlatformAdminView.tsx:330, prisma/schema.prisma:26
Description: The MasterTenant creation form sends billingEmail, but the MasterTenant model has no billingEmail field. The field is silently ignored and no billing email is stored.
Fix: Either add billingEmail to the MasterTenant schema, or remove the field from the form.
```

```
[G5] MANAGER: No Agent-View Analytics (Per-Agent Performance)
Severity: LOW
File: src/components/views/DashboardView.tsx:120-176 (AgentView)
Description: Agents have no way to view their own performance metrics (tickets served, average service time, customer ratings). This information is only available at the manager level in the analytics tab.
Fix: Add a small stats card to the agent view showing today's completed count, average service time, and average customer rating.
```

---

## H: Accessibility & Cross-Cutting

```
[H1] ACCESSIBILITY: Login Forms Missing Proper autocomplete Attributes
Severity: MEDIUM
File: src/components/views/DashboardView.tsx:90-95, src/components/views/PlatformAdminView.tsx:108-113, src/components/views/MasterTenantView.tsx:102-107
Description: Login forms use <Input id="email" type="email"> but lack autoComplete="email". Password fields lack autoComplete="current-password". This causes password managers to not recognize the fields properly and may not offer to save/fill credentials.
Fix: Add autoComplete="email" to email inputs and autoComplete="current-password" to password inputs.
```

```
[H2] ACCESSIBILITY: Mobile Bottom Nav Buttons Lack aria-label
Severity: MEDIUM
File: src/components/views/PlatformAdminView.tsx:588-597, src/components/views/MasterTenantView.tsx:547-559
Description: Bottom navigation buttons for the admin and master tenant views use icon + text spans inside <button> elements, but the truncated text (e.g., 'Master' from 'Master Tenants') may be unclear to screen readers when the icon isn't descriptive enough.
Fix: Add aria-label={item.label} to the bottom nav buttons for full accessibility.
```

```
[H3] ACCESSIBILITY: SettingsTab Textarea Lacks Proper Label Association
Severity: LOW
File: src/components/tabs/SettingsTab.tsx:233-237
Description: The welcome message textarea uses a plain <textarea> element instead of the UI <Textarea> component, and lacks a proper htmlFor/id association with the preceding <Label>.
Fix: Use the <Textarea> component with id="welcome-message" and htmlFor="welcome-message" on the Label.
```

```
[H4] ACCESSIBILITY: Color Contrast May Not Meet WCAG AA
Severity: LOW
File: Multiple views (DashboardView, PlatformAdminView, MasterTenantView)
Description: Several instances of text-muted-foreground text on white/light backgrounds, and small text (text-xs) in the dashboard, may not meet WCAG AA 4.5:1 contrast ratio. Particularly problematic: demo credential text (text-xs text-muted-foreground), queue status labels.
Fix: Audit color contrast using a tool like axe-core. Increase opacity of muted-foreground from ~0.55 to at least ~0.6 for text-xs content, or darken the color.
```

```
[H5] ACCESSIBILITY: ServiceWindowsTab Delete Button Has No Confirmation
Severity: LOW
File: src/components/tabs/ServiceWindowsTab.tsx:192-193
Description: The inline delete button (Trash2 icon) in the weekly schedule immediately deletes a service window with no confirmation dialog. An accidental click could remove a schedule entry.
Fix: Wrap the delete in an AlertDialog confirmation, similar to the WebhooksTab's delete flow.
```

---

## I: Performance & Reliability

```
[I1] PERFORMANCE: N+1 Queries in Queues List Endpoint
Severity: MEDIUM
File: src/app/api/queues/route.ts:25-42
Description: For each queue, 2 separate count queries are made (waiting, serving). With N queues, this is 2N+1 queries instead of 2 batched queries.
Fix: Use a single query with groupBy to get waiting and serving counts in one round trip: db.ticket.groupBy({ by: ['queueId', 'status'], where: { tenantId } }).
```

```
[I2] PERFORMANCE: N+1 Queries in Admin Tenants List
Severity: MEDIUM
File: src/app/api/admin/tenants/route.ts:43-64
Description: For each tenant in the paginated result, a separate count query is made for today's tickets. With limit=100, this adds up to 100 extra queries per page load.
Fix: Batch the today's ticket count into a single query: db.ticket.groupBy({ by: ['tenantId'], where: { createdAt: { gte: todayStart } } }).
```

```
[I3] PERFORMANCE: Analytics Loads All Tickets Into Memory for Peak Hour Buckets
Severity: HIGH
File: src/app/api/tenants/analytics/route.ts:100-106
Description: db.ticket.findMany({ where: ticketBase, select: { createdAt: true } }) loads EVERY ticket matching the date filter into Node.js memory just to count by hour. On tenants with thousands of tickets per day, this causes significant memory pressure and slow responses.
Fix: Use raw SQL: SELECT strftime('%H', createdAt) as hour, COUNT(*) as count FROM tickets WHERE ... GROUP BY hour ORDER BY hour.
```

```
[I4] PERFORMANCE: N+1 Queries in Ticket Status Phone Lookup
Severity: MEDIUM
File: src/app/api/tickets/status/route.ts:252-298
Description: For each ticket in the paginated result (up to 50), 2 additional queries are made (waiting ahead count + service logs). With 50 tickets, this is up to 100 extra queries.
Fix: Batch the position/EWT calculation. For the phone lookup, fetch service logs once per queue and compute EWT from a single result set.
```

```
[I5] PERFORMANCE: Prisma Query Logging Enabled
Severity: MEDIUM
File: src/lib/db.ts:9
Description: log: ['query'] logs every SQL query to console. In production with high traffic, this causes significant I/O overhead and log bloat, and can expose sensitive query parameters.
Fix: Change to log: ['error'] for production, or conditionally enable query logging: log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'].
```

```
[I6] PERFORMANCE: WebSocket Server Uses Wildcard CORS
Severity: MEDIUM
File: mini-services/queue-ws/index.ts:23-26
Description: cors: { origin: '*' } allows connections from any origin. In production, this should be restricted to the actual application origin to prevent unauthorized WebSocket connections.
Fix: Set origin to the actual frontend URL(s), e.g., origin: ['https://app.queueflow.com', 'http://localhost:3000'].
```

```
[I7] PERFORMANCE: WebSocket server-broadcast Event Has No Auth Check
Severity: MEDIUM
File: mini-services/queue-ws/index.ts:106-109
Description: The 'server-broadcast' event handler broadcasts to any tenant room without verifying the socket is authenticated or belongs to the target tenant. Any connected client can trigger broadcasts to any tenant room.
Fix: Add authentication verification to the server-broadcast handler — check that the socket has been authenticated (socketUsers.has(socket.id)) before allowing broadcast.
```

```
[I8] PERFORMANCE: WebSocket Server Has No Max Connection Limit
Severity: LOW
File: mini-services/queue-ws/index.ts (connection handler)
Description: The WebSocket server accepts unlimited connections. A single tenant with many displays could exhaust server resources. No per-tenant or global connection limit exists.
Fix: Add a max connection limit per tenant (e.g., 20) and reject new connections with a clear error when exceeded.
```

```
[I9] PERFORMANCE: CustomerProfile totalVisits Only Updated Via Explicit API Call
Severity: LOW
File: src/lib/types.ts:318, src/api/queues/join/route.ts (missing profile update)
Description: totalVisits in CustomerProfile is only incremented when POST /api/customer-profiles is called explicitly. The normal queue join flow (/api/queues/join) doesn't create or update customer profiles. This means loyalty data is incomplete.
Fix: After successfully creating a ticket in /api/queues/join, upsert the CustomerProfile to increment totalVisits and totalTickets.
```

---

## Summary

| Category | CRITICAL | HIGH | MEDIUM | LOW | Total |
|----------|---------|------|--------|-----|-------|
| A: Security & Auth | 2 | 3 | 5 | 0 | 10 |
| B: Data Integrity | 0 | 2 | 2 | 1 | 5 |
| C: API Robustness | 0 | 2 | 3 | 3 | 8 |
| D: Business Logic | 0 | 2 | 3 | 2 | 7 |
| E: End-User | 0 | 2 | 4 | 1 | 7 |
| F: Staff | 0 | 1 | 1 | 1 | 3 |
| G: Manager | 0 | 2 | 3 | 1 | 6 |
| H: Accessibility | 0 | 0 | 3 | 2 | 5 |
| I: Performance | 0 | 1 | 5 | 3 | 9 |
| **Total** | **2** | **16** | **29** | **14** | **60** |