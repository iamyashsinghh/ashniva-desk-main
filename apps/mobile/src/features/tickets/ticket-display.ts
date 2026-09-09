import { TICKET_STATUS_TONES } from '@ashniva/ui/status-tone';
import type { TicketAction, TicketActionAvailability, TicketStatus } from '@ashniva/types';

import type { PillTone } from '../../shared/components/primitives';

/** Status colour, from the same table the web app uses. See `task-display.ts` for the mapping. */
export function ticketTone(status: TicketStatus): PillTone {
  const tone = TICKET_STATUS_TONES[status];
  return tone === 'review' ? 'info' : tone;
}

/**
 * Whether the API offered this action to this caller on this ticket.
 *
 * The whole decision is the server's; the constant only names which entry to look for. A missing
 * entry and a disabled one are the same answer here — a refused transition on a ticket is always
 * about status or role, never about timing, so there is nothing a greyed button would explain.
 */
export function ticketCan(
  actions: readonly TicketActionAvailability[],
  action: TicketAction,
): boolean {
  return actions.some((entry) => entry.action === action && entry.enabled);
}
