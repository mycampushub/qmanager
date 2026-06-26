# Task E-1: Section E Fixes (MarketingView, JoinView, KioskView)

## Changes Made

### 1. MarketingView.tsx — E4/E5/E6

**E4: Pricing Section Update**
- Replaced the existing 3-tier pricing data with the required plan details:
  - **FREE**: 2 queues, 3 staff, 50 tickets/day, ৳0/mo, CTA "Start Free Trial"
  - **PRO**: 10 queues, 15 staff, 500 tickets/day, ৳999/mo, CTA "Start Free Trial", emerald accent with "Recommended" badge
  - **ENTERPRISE**: Unlimited queues, Unlimited staff, Unlimited tickets, ৳4,999/mo, CTA "Contact Sales"
- Updated nav bar (desktop + mobile) to include FAQ and Contact links

**E5: FAQ Section**
- Added 6 collapsible FAQ items after the pricing section with `useState` toggle:
  1. "How does the queue system work?"
  2. "Is there a free trial?"
  3. "Can I customize the display?"
  4. "What happens when I run out of wallet balance?"
  5. "Can I manage multiple branches?"
  6. "Is my data secure?"
- Each FAQ uses Card + chevron rotation animation (no shadcn Accordion to keep it simple with useState)
- Added new icons: `ChevronDown`, `HelpCircle`, `Send`, `MessageSquare`
- Added imports: `Input`, `Textarea`, `toast`

**E6: Contact Section**
- Added contact form section before the CTA section with:
  - Name input, Email input, Message textarea
  - Submit button with loading state
  - On submit: validates fields, simulates 800ms delay, shows success toast, clears form

**Footer Navigation Fix**
- Footer already used `setCurrentView` for navigation links (verified)
- Replaced old "Pricing" scroll link with "FAQ" and "Contact" scroll links
- All navigation links use `setCurrentView` for view changes and `scrollTo` for same-page anchors

---

### 2. JoinView.tsx — E3/E9/E16

**E3/E16: Find My Ticket by Phone**
- Added `Search` icon import
- Added `onFindTicket` prop to `StepSelectLocation` component
- Added "Find My Ticket" section at the bottom of the location selection page with:
  - Phone number input with +880 prefix
  - Search button with loading state
  - Enter key support for search
- Created new `StepFindTicketResults` component that displays:
  - Active tickets with: formatted serial, queue name, StatusBadge, people ahead, position, "Track" button
  - Past tickets with: formatted serial, queue name, StatusBadge
  - Empty state when no tickets found
- Added new `findTicket` step to the Step type
- Added `handleFindTicket` callback: calls `GET /api/tickets/status?phone=...`, navigates to findTicket step
- Added `handleTrackFromFind` callback: sets active ticket, navigates to confirmation with polling
- Added states: `loadingFindTickets`, `findTicketPhone`, `findTicketResults`
- Updated back button handler to handle findTicket step

**E9: Ticket Status Polling Improvements**
- Added `isPolling` state and `prevStatusRef` ref to track status changes
- Added `stopPolling()` callback that clears interval and sets `isPolling = false`
- Updated `startPolling()` to set `isPolling = true` and record initial status
- Added `useEffect` that auto-stops polling when ticket reaches SERVING, COMPLETED, SKIPPED, or CANCELLED
- Updated `handleTrack()` to only show toast on actual status change (compares prevStatusRef)
- Added pulsing indicator (animated ping dot) in `StepTicketConfirmation` header when `isPolling` is true
- Added "Live tracking active" text label next to tenant name when polling
- Passed `isPolling` prop through to `StepTicketConfirmation`
- Updated `handleNewTicket`, `handleLeaveQueue`, `handleHome` to use `stopPolling()`

---

### 3. KioskView.tsx — E8

**E8: Audio Feedback on Ticket Creation**
- Added `playSuccessChime()` function using Web Audio API:
  - Two-tone ascending chime: C5 (523.25Hz) then E5 (659.25Hz)
  - Each tone uses sine oscillator with exponential gain ramp for smooth fade
  - Second tone starts 150ms after first for a pleasant ascending effect
  - Wrapped in try/catch to silently fail if AudioContext unavailable
- Called `playSuccessChime()` immediately after successful ticket creation in `handleCheckIn`

---

## Verification
- `bun run lint` returns 0 errors, 0 warnings
- All existing functionality preserved (no breaking changes)
- All new imports and components use existing shadcn/ui primitives
