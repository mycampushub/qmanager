/**
 * Ticket State Machine — QueueFlow
 *
 * Defines all valid state transitions for a Ticket.
 * Use `canTransition(from, to)` to guard every state change.
 */

type TicketStatus =
  | 'WAITING'
  | 'SERVING'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED';

type TransitionAction = 'call' | 'complete' | 'skip' | 'cancel' | 'recall';

interface Transition {
  to: TicketStatus;
  action: TransitionAction;
}

/**
 * VALID_TRANSITIONS maps every source status to the list of
 * allowed destination states (and the action that triggers it).
 *
 * Key change: SKIPPED → SERVING (recall) allows calling back
 * a skipped ticket at any time.
 */
const VALID_TRANSITIONS: Record<TicketStatus, Transition[]> = {
  WAITING: [
    { to: 'SERVING', action: 'call' },
    { to: 'CANCELLED', action: 'cancel' },
  ],
  SERVING: [
    { to: 'COMPLETED', action: 'complete' },
    { to: 'SKIPPED', action: 'skip' },
    { to: 'CANCELLED', action: 'cancel' },
  ],
  SKIPPED: [
    { to: 'SERVING', action: 'recall' },
    { to: 'CANCELLED', action: 'cancel' },
  ],
  COMPLETED: [],
  CANCELLED: [],
};


/**
 * Returns `true` when transitioning from `from` to `to` is valid.
 */
export function canTransition(from: string, to: string): boolean {
  const transitions = VALID_TRANSITIONS[from as TicketStatus];
  if (!transitions) return false;
  return transitions.some((t) => t.to === to);
}