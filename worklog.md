---
Task ID: 1
Agent: Main
Task: Add ticket PDF download with branding, QR code, track button + simplify ticket view to 2 buttons only

Work Log:
- Read existing codebase: TicketStatus.tsx, JoinForm.tsx, print-ticket.tsx, download-ticket-pdf.tsx, page.tsx, types.ts, join-helpers.tsx, package.json
- Installed `jspdf@4.2.1` and `qrcode@1.5.4` (with @types/qrcode) for real PDF generation
- Rewrote `src/lib/download-ticket-pdf.tsx` from print-window approach to real PDF generation using jsPDF + qrcode
- Modified `src/components/join/TicketStatus.tsx` to show only 2 buttons: "Download Ticket" and "Cancel Ticket"
- Removed: Track Your Position, Copy Link, Refresh Status, Check Other Tickets, Leave Queue, Back to Home buttons
- Renamed "Leave Queue" to "Cancel Ticket" with updated dialog text
- TypeScript compilation (`npx tsc --noEmit`) passed with zero errors

Stage Summary:
- `src/lib/download-ticket-pdf.tsx` — Complete rewrite: uses jsPDF for real A4 PDF with business name banner (branding color), status badge, large ticket number, position/ahead/est-wait stats, customer details, QR code (generated via `qrcode` package), clickable "TRACK YOUR LIVE POSITION" button linking to `?ticket={id}`, tracking URL text, and "Powered by QueueFlow" footer. PDF auto-downloads as `Ticket-{serial}.pdf`.
- `src/components/join/TicketStatus.tsx` — Simplified actions section to exactly 2 buttons: (1) "Download Ticket" with primary color, shows loading spinner during generation, (2) "Cancel Ticket" (red outline, only shown when status=WAITING). Removed 6 other buttons. Updated cancel dialog wording.
- Packages added: jspdf@4.2.1, qrcode@1.5.4, @types/qrcode@1.5.6

---
Task ID: 2-a
Agent: Main
Task: Implement appointment-as-pre-booking: online booking API, cancel endpoint, EWT enhancement, booking widget, staff UI updates, cross-dedup

Work Log:
- Read full codebase: schema.sql, types.ts, tickets/status/route.ts, queues/join/route.ts, appointments/route.ts, AppointmentsTab.tsx, JoinView.tsx, page.tsx, cancel/route.ts, webhook-dispatch.ts, ws-emit.ts, auth.ts, datetime.ts, utils.ts
- Schema changes in `schema.sql`:
  - Added `source TEXT NOT NULL DEFAULT 'WALK_IN'` to `tickets` table
  - Added `source TEXT NOT NULL DEFAULT 'STAFF'` and `booking_order INTEGER DEFAULT 0` to `appointments` table
  - Changed `scheduled_time TEXT NOT NULL` to `scheduled_time TEXT DEFAULT ''` (optional for online bookings)
  - Added indexes: `idx_appointments_queue_date`, `idx_tickets_source`
- Updated `src/lib/types.ts`:
  - Added `TicketSource` type (`'WALK_IN' | 'ONLINE_BOOKING'`)
  - Added `source`, `_estimatedServiceTime`, `_serviceOpensAt` to `Ticket` interface
  - Added `source`, `booking_order` to `TicketRow` and `AppointmentRow`
  - Added `'booking'` to `AppView` union type
- Created `src/app/api/appointments/book/route.ts`:
  - Public (unauthenticated) POST endpoint for online booking
  - Validates: tenant active, queue active, date is today/future, service windows exist for date, plan limits, wallet balance
  - Phone dedup: checks existing WAITING/SERVING tickets AND existing bookings for same date+queue+phone
  - Skips: service window time check, break check, join_paused check (customer not physically present)
  - Atomic batch: increment serial → create ticket (source=ONLINE_BOOKING) → create appointment (status=CONFIRMED, source=ONLINE) → create ledger → create transaction → upsert customer profile
  - Returns: ticket with serial, EWT, absolute estimated service time, service open time, tracking URL
- Created `src/app/api/appointments/cancel/route.ts`:
  - Public POST endpoint for customer self-cancellation
  - Requires ticketId + tenantId, optional customerPhone for ownership verification
  - Atomic batch: cancel ticket (WAITING→CANCELLED) + cancel linked appointment (CONFIRMED→CANCELLED)
  - Refunds wallet + creates REFUND transaction
  - Fires webhooks + WebSocket events
- Enhanced `src/app/api/tickets/status/route.ts`:
  - Added `getEstimatedServiceTime()` helper for ONLINE_BOOKING tickets
  - Single ticket lookup now includes `source`, `customerPhone`, `_estimatedServiceTime`, `_serviceOpensAt`
  - Phone list lookup now includes `source` field
  - For ONLINE_BOOKING WAITING tickets: computes absolute estimated service time from service window open time + EWT
- Created `src/components/views/BookingView.tsx`:
  - Full embeddable booking widget component
  - Two-step flow: form → success confirmation
  - Form: queue selector (auto-selects if 1), 7-day date picker grid, name, optional phone
  - Success: branded ticket card with serial, position/ahead/EWT stats, absolute estimated service time box, tracking URL, Download Ticket PDF, Cancel Booking
  - Uses tenant branding colors throughout
  - Cancel dialog with confirmation
  - Accessible via `?book=tenantId`
- Updated `src/app/page.tsx`:
  - Added BookingView import
  - Added `?book=tenantId` URL param handling (takes priority over other params)
  - Added `booking` to hasPublicParams check (prevents auth redirect)
  - Renders BookingView when currentView === 'booking'
- Updated `src/app/api/queues/join/route.ts`:
  - Phone dedup now also checks for active online bookings for today's date in the same queue
  - Uses `Intl.DateTimeFormat('en-CA')` for today's date string in client timezone
- Updated `src/app/api/appointments/route.ts` (staff):
  - GET response now includes `source` field from appointments table
  - Staff POST now sets `source: 'STAFF'` on creation
- Updated `src/components/tabs/AppointmentsTab.tsx`:
  - Added `CONFIRMED` status config (Online Booking, violet color)
  - Added `source` and `ticket` to Appt interface
  - Added tab filter: All / Online / Staff
  - Stats: added "Online" count (violet)
  - 5-column stats grid (was 4)
  - CONFIRMED appointments show "Has Ticket" badge + No Show button (no Check In — they already have a ticket)
  - Online bookings show "Online" badge (violet) and ticket serial badge
  - "Pre-booked" label shown for online bookings without a specific time

Stage Summary:
- Core concept: Appointment = Pre-booked Queue Position. No timeslots, no cron conversion. Online booking instantly creates a WAITING ticket with next serial number.
- New files: `src/app/api/appointments/book/route.ts`, `src/app/api/appointments/cancel/route.ts`, `src/components/views/BookingView.tsx`
- Modified files: `schema.sql`, `src/lib/types.ts`, `src/app/page.tsx`, `src/app/api/tickets/status/route.ts`, `src/app/api/queues/join/route.ts`, `src/app/api/appointments/route.ts`, `src/components/tabs/AppointmentsTab.tsx`
- TypeScript compilation (`npx tsc --noEmit`) passed with zero errors
- Booking widget URL: `?book={tenantId}` — can be embedded via iframe on business websites