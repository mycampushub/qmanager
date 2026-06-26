/**
 * Ticket State Machine — QueueFlow
 *
 * Defines all valid state transitions for a Ticket.
 * Use `canTransition(from, to)` to guard every state change.
 */

export type TicketStatus =
  | 'WAITING'
  | 'SERVING'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED';

type TransitionAction = 'call' | 'complete' | 'skip' | 'cancel';

interface Transition {
  to: TicketStatus;
  action: TransitionAction;
}

/**
 * VALID_TRANSITIONS maps every source status to the list of
 * allowed destination states (and the action that triggers it).
 */
export const VALID_TRANSITIONS: Record<TicketStatus, Transition[]> = {
  WAITING: [
    { to: 'SERVING', action: 'call' },
    { to: 'CANCELLED', action: 'cancel' },
  ],
  SERVING: [
    { to: 'COMPLETED', action: 'complete' },
    { to: 'SKIPPED', action: 'skip' },
    { to: 'CANCELLED', action: 'cancel' },
  ],
  COMPLETED: [],
  SKIPPED: [],
  CANCELLED: [],
};

/** Terminal statuses — no further transitions are possible. */
export const TERMINAL_STATUSES: TicketStatus[] = [
  'COMPLETED',
  'SKIPPED',
  'CANCELLED',
];

/**
 * Returns `true` when transitioning from `from` to `to` is valid.
 */
export function canTransition(from: string, to: string): boolean {
  const transitions = VALID_TRANSITIONS[from as TicketStatus];
  if (!transitions) return false;
  return transitions.some((t) => t.to === to);
}

/**
 * Returns the action name for a given transition, or `null` if invalid.
 */
export function getTransitionAction(
  from: string,
  to: string
): TransitionAction | null {
  const transitions = VALID_TRANSITIONS[from as TicketStatus];
  if (!transitions) return null;
  const match = transitions.find((t) => t.to === to);
  return match ? match.action : null;
}