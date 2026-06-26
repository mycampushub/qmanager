# QueueFlow Audit Report — Categories D, E, F, G

> Excludes all previously fixed items (E3/E9/E16, E4/E5/E6, E8, E10, E11, E12, E15, H1, H8, I1, I3, I4, I8, all Section J).

---

## D — Business Logic & Data Integrity

[D1] HIGH: Agent ticket complete/skip/cancel handlers ignore server errors
File: src/components/views/DashboardView.tsx:221
Description: `handleComplete`, `handleSkip`, and `handleCancel` in AgentView do not check `res.ok` before showing a success toast. If the server returns a 4xx/5xx error, the UI still claims success and clears the current ticket, losing track of the in-progress service.
Fix: Parse the response JSON and check `res.ok` before calling `toast.success`. On failure, show `toast.error(data.error || 'Failed')` and do NOT clear `currentTicket`.

[D2] HIGH: Kiosk position calculation ignores cancelled/skipped tickets
File: src/components/views/KioskView.tsx:496
Description: `const position = Math.max(1, data.ticket.serialNumber - (data.ticket.queue?.nowServingSerial || 0))` computes position as the raw serial delta. If tickets A-003 and A-005 were cancelled, a newly created A-007 would show position 2 when it might actually be position 1 (the only WAITING ticket). The position is misleading to the customer.
Fix: Use the `_peopleAhead` value from the API (which should be computed server-side from actual WAITING tickets), or add an `orderBy` position query. Fallback: `position: data.position ?? Math.max(1, ...)`.

[D3] HIGH: FeedbackTab "Satisfaction %" uses mismatched numerator/denominator
File: src/components/tabs/FeedbackTab.tsx:85
Description: `npsEstimate` uses `distribution[4] + distribution[3]` (computed from the **filtered** period's feedbacks) divided by `total` (the **all-time** total from the API). When the filter is "today" and there are 3 five-star reviews today out of 100 all-time reviews, it shows 3% instead of the correct per-period value. The label "Satisfaction" is also not NPS — it's a top-2-box percentage.
Fix: Use `feedbacks.length` (the period count) as the denominator instead of `total`: `Math.round(((distribution[4] + distribution[3]) / Math.max(feedbacks.length, 1)) * 100)`. Consider renaming to "Positive Rating %" to avoid NPS confusion.

[D4] MEDIUM: QueuesTab badge claims "X active" but counts ALL queues
File: src/components/views/DashboardView.tsx:704
Description: `<Badge>{queues.length} active</Badge>` where `queues = tenantData?.queues || []` (line 658) fetches all queues regardless of `isActive`. The badge is misleading when inactive queues exist.
Fix: Change to `{queues.filter(q => q.isActive).length} active` or use a computed count from the API like `tenantData?._activeQueueCount`.

[D5] MEDIUM: Walk-in ticket creation has no loading guard — allows duplicates
File: src/components/views/DashboardView.tsx:281
Description: `handleWalkIn` has no `loading` state. If the API is slow, a staff member can click "Add" multiple times, creating duplicate walk-in tickets for the same customer.
Fix: Add a `walkInLoading` state, disable the button while loading, and set it before/after the fetch call.

[D6] MEDIUM: DashboardView login checks `data.user.type` but API may return `role`
File: src/components/views/DashboardView.tsx:61
Description: `if (data.user.type === 'platform_admin')` is the sole check for redirecting to admin. If the API returns `role: 'PLATFORM_ADMIN'` instead of `type: 'platform_admin'`, the redirect fails and a platform admin user lands on the staff dashboard. PlatformAdminView line 78 correctly checks both fields.
Fix: Check both fields: `if (data.user.type === 'platform_admin' || data.user.role === 'PLATFORM_ADMIN')`.

[D7] MEDIUM: ServiceWindowsTab allows saving closeTime before openTime
File: src/components/tabs/ServiceWindowsTab.tsx:67
Description: `handleSave` does not validate that `formClose > formOpen`. A user can save a window that closes at 08:00 and opens at 17:00, which is logically invalid. The "Currently OPEN/CLOSED" indicator (line 112) would then compute incorrectly using string comparison.
Fix: Add validation in `handleSave`: `if (formOpen >= formClose) { toast.error('Close time must be after open time'); return; }`.

[D8] MEDIUM: MasterTenantView BranchesTab/StafTab/AnalyticsTab fetch ALL tenants client-side
File: src/components/views/MasterTenantView.tsx:137,219,313
Description: All three tabs call `fetch('/api/tenants')` (no auth, no filtering) and filter by `masterTenantId` on the client. This exposes all tenant data (names, IDs, balances, queue counts) to any logged-in user. It's also inefficient.
Fix: Create a dedicated API endpoint like `/api/master-tenants/[id]/branches` that only returns tenants belonging to the master tenant, with proper auth checks.

[D9] MEDIUM: MasterTenantView MTLoginScreen doesn't verify MANAGER role
File: src/components/views/MasterTenantView.tsx:74
Description: The login only checks `user.tenant?.masterTenantId` exists. Any AGENT-level user belonging to a franchise tenant can access the Franchise HQ dashboard with full visibility into all branches, staff, and analytics.
Fix: Add a role check: `if (user.role !== 'MANAGER') { toast.error('Manager access required'); return; }`.

[D10] LOW: MasterTenantView StaffTab displays fabricated placeholder data
File: src/components/views/MasterTenantView.tsx:319-325
Description: StaffTab generates fake data like `"${t.name} Manager"` and `agent1@${t.name.toLowerCase().replace(/\s/g, '')}.com`. There's a small disclaimer, but the fake emails and names could be confused with real data, especially in a demo-to-production transition.
Fix: Show a prominent "Demo Data" banner, or better, call a real staff API endpoint with proper auth for the master tenant.

[D11] LOW: DisplayView uses PUT to fetch tenant data
File: src/components/views/DisplayView.tsx:257
Description: `fetch('/api/tenants', { method: 'PUT', body: JSON.stringify({ tenantId }) })` uses HTTP PUT (meant for updates) to read tenant data. This is a REST anti-pattern. DashboardView.tsx:1619 has the same issue.
Fix: Change to `GET /api/tenants?tenantId=${tenantId}` or the equivalent read endpoint. Update both DisplayView and DashboardView.

---

## E — UX Feedback & Missing Features

[E1] HIGH: Dashboard mobile bottom nav overflows with 12+ items for managers
File: src/components/views/DashboardView.tsx:1751-1764
Description: The mobile bottom nav maps ALL `navItems` (up to 12 for managers: Agent, Queues, Analytics, Wallet, Hours, Appts, Feedback, Webhooks, Branding, Staff, Settings) into `flex-1` buttons. On a 375px phone, each button gets ~31px — the icons and truncated labels become illegible and tappable areas are too small.
Fix: Show only 4-5 primary items in the bottom nav (e.g., Agent, Queues, More). The "More" item opens a sheet/drawer with the remaining tabs. Alternatively, use a horizontally scrollable nav with fixed-width items.

[E2] HIGH: KioskView shows no error state when queue loading fails
File: src/components/views/KioskView.tsx:463
Description: If `/api/tenants/${tenant.id}/queues` returns an error, the catch shows a toast that disappears after a few seconds, and the user sees an empty queue list that's indistinguishable from "this location has no queues." The kiosk is left in a broken state.
Fix: Add an error state variable. On fetch failure, show a dedicated error screen with a "Try Again" button that re-fetches the queues, rather than an empty list.

[E3] HIGH: SettingsTab locale preference is not persisted
File: src/components/tabs/SettingsTab.tsx:131-134
Description: `handleLocaleChange` calls `setLocale(newLocale)` which only updates in-memory state. On page reload, the language resets to the default. A tenant operator who sets Bengali will find it reverted every session.
Fix: Persist the locale choice to localStorage (`qms_locale`) and read it on mount. Optionally sync to the server via the tenant settings API.

[E4] MEDIUM: Staff delete uses native `confirm()` instead of AlertDialog
File: src/components/views/DashboardView.tsx:1321
Description: `if (!confirm(`Delete ${member.name}?...`))` uses the browser's native dialog, which is inconsistent with the AlertDialog pattern used everywhere else (queue deletion, leave queue, webhook deletion). It also blocks the main thread and breaks the visual design.
Fix: Replace with a state-driven AlertDialog, matching the pattern in DeleteQueueDialog and WebhooksTab.

[E5] MEDIUM: AppointmentsTab "No Show" action has no confirmation
File: src/components/tabs/AppointmentsTab.tsx:174
Description: Clicking "No Show" immediately calls `handleStatus(a.id, 'NO_SHOW')` without any confirmation dialog. Marking a customer as a no-show is a significant action that could affect customer relationships and analytics. The cancel action in JoinView properly uses an AlertDialog.
Fix: Add an AlertDialog confirmation before marking as no-show, similar to the "Leave Queue" pattern in JoinView.

[E6] MEDIUM: AppointmentsTab stats grid is not responsive
File: src/components/tabs/AppointmentsTab.tsx:142
Description: `grid-cols-4` on the stats row will be too cramped on small screens. Each stat card gets ~85px on a 375px phone, making the numbers hard to read.
Fix: Change to `grid-cols-2 sm:grid-cols-4`.

[E7] MEDIUM: SettingsTab export buttons have no loading feedback
File: src/components/tabs/SettingsTab.tsx:283-288
Description: Clicking "Export CSV" or "Export JSON" has no loading state. If the server is slow, the user gets no feedback and might click multiple times, triggering multiple downloads.
Fix: Add loading state per button, disable during export, and show a spinner icon.

[E8] MEDIUM: WebhooksTab toggle active has silent failure
File: src/components/tabs/WebhooksTab.tsx:88-93
Description: `toggleActive` only shows toast on success. The catch block (`toast.error('Network error')`) exists but if the server returns a non-OK response (e.g., 403), no error message is shown to the user — the toggle silently reverts.
Fix: Add `else { const d = await res.json(); toast.error(d.error || 'Failed to toggle'); }` after the `if (res.ok)` check.

[E9] MEDIUM: SERVING appointment status uses AlertTriangle icon
File: src/components/tabs/AppointmentsTab.tsx:31
Description: `SERVING: { icon: AlertTriangle }` associates a warning icon with a normal "being served" state. This is semantically incorrect and could alarm staff reviewing appointments.
Fix: Change to `icon: UserCheck` or `icon: Clock` (both already imported).

[E10] LOW: PlatformAdminView tenant "View" button is a stub
File: src/components/views/PlatformAdminView.tsx:271
Description: `onClick={() => toast.info(`Viewing ${t.name} (details coming soon)`)}` — the eye icon button does nothing useful. A platform admin has no way to view tenant details, manage tenants, or perform any action on a tenant.
Fix: Either implement a tenant detail dialog/view or remove the button and add a note that tenant management is coming soon.

---

## F — Accessibility

[F1] HIGH: No `aria-live` region for live ticket status changes
File: src/components/views/JoinView.tsx (StepTicketConfirmation), src/components/views/DisplayView.tsx
Description: When a ticket's status changes from WAITING to SERVING (the most critical notification), screen readers are not notified because there's no `aria-live="assertive"` region. The "It's Your Turn!" heading appears visually but is not announced to assistive technology. Similarly, the DisplayView's "Now Serving" number changes silently.
Fix: Wrap the status heading in JoinView's StepTicketConfirmation with `aria-live="assertive" aria-atomic="true"`. In DisplayView, add an `aria-live="polite"` region around the now-serving serial number.

[F2] HIGH: Skip-to-content link is not the first focusable element
File: src/app/page.tsx:111-116
Description: The skip link (`<a href="#main-content">`) is rendered AFTER `<Toaster>` and `<RegistrationDialog>`. While the Toaster may not render focusable elements, the RegistrationDialog might. The skip link MUST be the very first focusable element in the DOM to work correctly when Tab is pressed.
Fix: Move the skip-to-content `<a>` to be the first child of the root fragment, before `<Toaster>` and `<RegistrationDialog>`.

[F3] MEDIUM: Dashboard sidebar and mobile nav lack `aria-current` and `role`
File: src/components/views/DashboardView.tsx:1566-1580, 1751-1764
Description: The active sidebar/mobile nav button has no `aria-current="page"` attribute. Screen readers cannot determine which tab is currently active. The nav also lacks `role="navigation"` and `aria-label`.
Fix: Add `aria-current="page"` to the active nav button. Wrap both the sidebar nav and bottom nav in `<nav aria-label="Dashboard navigation">`.

[F4] MEDIUM: PlatformAdminView and MasterTenantView sidebars lack `aria-current`
File: src/components/views/PlatformAdminView.tsx:477-489, src/components/views/MasterTenantView.tsx:419-432
Description: Same issue as F3 — active sidebar nav items have no `aria-current` attribute. Mobile bottom navs also lack `role="navigation"`.
Fix: Add `aria-current="page"` to the active button and `aria-label` to nav containers.

[F5] MEDIUM: KioskView and DisplayView tenant/queue selection cards lack ARIA
File: src/components/views/KioskView.tsx:124-141, 169-198; src/components/views/DisplayView.tsx:107-135
Description: Tenant selection cards in KioskView and DisplayView are clickable `<div>` or `<Card>` elements without `role="button"`, `tabIndex={0}`, `aria-label`, or keyboard event handlers. They are completely inaccessible via keyboard.
Fix: Add `role="button"`, `tabIndex={0}`, `aria-label={tenant.name}`, and `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t); } }}` to each card. Better yet, use `<button>` elements.

[F6] MEDIUM: ServiceWindowsTab delete/edit icon buttons lack `aria-label`
File: src/components/tabs/ServiceWindowsTab.tsx:192-193
Description: `<button onClick={() => openEdit(w)}><Pencil className="w-3 h-3 inline" /></button>` and the Trash2 button have no `aria-label`. Screen readers will announce them as "button" with no context.
Fix: Add `aria-label={`Edit schedule for ${DAYS[w.dayOfWeek]}`}` and `aria-label="Delete schedule"`.

[F7] MEDIUM: FeedbackTab star rating buttons lack accessible names
File: src/components/views/JoinView.tsx:838
Description: The star buttons have `aria-label={`Rate ${s} star${s > 1 ? 's' : ''}`}` which is good, but the rating input as a whole lacks `role="radiogroup"` and `aria-label="Rating"`. The textarea in the feedback form also lacks an `<label>` element.
Fix: Wrap the stars in a `<div role="radiogroup" aria-label="Rating">`. Add a `<label>` for the comment textarea.

[F8] LOW: WebhooksTab checkbox inputs use raw `<input>` instead of accessible components
File: src/components/tabs/WebhooksTab.tsx:130-132
Description: `<input type="checkbox" ... className="rounded border-slate-300" />` uses a raw HTML checkbox without proper label association. The `<label>` wrapping it is a `<label>` but uses a `<span>` for the event name text, which should be fine, but the checkbox itself lacks `id` and the label lacks `htmlFor`.
Fix: Add `id={`event-${ev}`}` to the input and `htmlFor={`event-${ev}`}` to the label, or use the project's `Switch`/`Checkbox` component.

---

## G — Responsive & Layout

[G1] HIGH: Dashboard sidebar mobile overlay doesn't trap focus
File: src/components/views/DashboardView.tsx:1680-1688
Description: When the mobile sidebar opens, focus is not trapped inside it. A keyboard user can Tab to elements behind the overlay. The backdrop click-to-close is mouse-only — pressing Escape doesn't close it.
Fix: Add `onKeyDown={(e) => { if (e.key === 'Escape') setSidebarOpen(false); }}` to the overlay. Optionally add a focus trap using `react-focus-lock` or similar.

[G2] HIGH: Same focus trap and Escape key missing in PlatformAdminView and MasterTenantView
File: src/components/views/PlatformAdminView.tsx:548-556, src/components/views/MasterTenantView.tsx:509-518
Description: Same issue as G1 — mobile sidebar overlays have no focus trap or Escape key handler.
Fix: Same as G1 — add Escape key handler to the backdrop overlay.

[G3] MEDIUM: DisplayView "NOW SERVING" text uses `clamp()` for responsive sizing but not queue status grid
File: src/components/views/DisplayView.tsx:455, 528-579
Description: The main serial number uses `clamp(80px, 12vw, 160px)` which is good. However, the queue status grid (line 528) uses `w-56` fixed-width cards in a horizontal flex container with `overflow-hidden`. On a narrow TV/monitor, queues beyond the visible area are unreachable and there's no scroll indication.
Fix: Ensure the `ScrollArea` on line 527 is properly visible with scroll indicators, or make the queue cards responsive (`w-auto min-w-[14rem]`).

[G4] MEDIUM: KioskView buttons may be too small on actual kiosk touch screens
File: src/components/views/KioskView.tsx:125, 169, 275
Description: Kiosk tenant/queue selection buttons use default sizing. On actual kiosk hardware (often 15-22" touchscreens), the tap targets may be smaller than the recommended 48x48px minimum for touch interfaces. The check-in form's "Join Queue" button (line 275, `h-14`) is adequate, but the queue cards and back buttons are smaller.
Fix: Ensure all kiosk interactive elements have a minimum touch target of 48x48px. The queue select cards should have `min-h-[56px]` and the back link should be a proper button with adequate size.

[G5] MEDIUM: Analytics tab table overflows on small dashboard screens
File: src/components/views/DashboardView.tsx:871
Description: The queue performance table has `overflow-x-auto` on the container but the table itself has 6 columns (Queue, Waiting, Serving, Completed, Avg Service, EWT) which may be tight on tablets. The recent activity list is fine, but the table doesn't indicate scrollability.
Fix: Add a visual scroll indicator or ensure the table has a minimum width that triggers horizontal scrolling gracefully. Consider hiding less-critical columns (Avg Service, EWT) on smaller screens.

[G6] LOW: MarketingView FAQ accordion icons may have animation issues with reduced motion
File: src/components/views/MarketingView.tsx
Description: While H8 handles the main page-level reduced motion, individual marketing page animations (accordion chevrons, staggered card animations) inside MarketingView are not individually wrapped with `prefers-reduced-motion` checks. The framer-motion `motion.div` elements will still animate within the marketing page.
Fix: Pass `reducedMotion` context or check `prefers-reduced-motion` inside MarketingView to disable individual animations.

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 13    |
| MEDIUM   | 20    |
| LOW      | 7     |
| **Total**| **40**|

### Top Priority Fixes
1. **D1** — Agent complete/skip/cancel ignoring server errors (data loss risk)
2. **D2** — Kiosk position miscalculation (customer confusion)
3. **F1** — No aria-live for ticket status changes (accessibility critical)
4. **F2** — Skip-to-content not first focusable (accessibility critical)
5. **E1** — Mobile bottom nav overflows (unusable on phones)
6. **D6** — Login platform admin redirect fragile (auth bypass risk)
7. **D9** — MasterTenant login missing role check (privilege escalation)
8. **G1/G2** — Mobile sidebar focus trap missing (keyboard trap)