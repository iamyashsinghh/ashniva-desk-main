import {
  CLIENT_VISIBLE_STATUS_TONES,
  SLA_STATUS_TONES,
  TICKET_STATUS_TONES,
  type Tone,
} from '@ashniva/ui/status-tone';
import {
  CLIENT_VISIBLE_STATUS,
  ROLE_KEYS,
  TICKET_STATUS,
  TICKET_STATUS_LABELS,
  type ClientVisibleStatus,
  type DirectoryEntry,
  type RoleKey,
  type SlaTargetStatus,
  type TicketAction,
  type TicketActionAvailability,
  type TicketHistoryEntry,
  type TicketStatus,
} from '@ashniva/types';

import type { IconName, IconTone } from '../../shared/components/Icon';
import type { PillTone } from '../../shared/components/primitives';

/** The web's tones have a `review` step the phone's pills do not; it reads closest to info. */
function pillTone(tone: Tone): PillTone {
  return tone === 'review' ? 'info' : tone;
}

/** Status colour, from the same table the web app uses. See `task-display.ts` for the mapping. */
export function ticketTone(status: TicketStatus): PillTone {
  return pillTone(TICKET_STATUS_TONES[status]);
}

/** The client-visible status's colour, from the same table the web portal uses. */
export function clientTicketTone(status: ClientVisibleStatus): PillTone {
  return pillTone(CLIENT_VISIBLE_STATUS_TONES[status]);
}

export function slaTone(status: SlaTargetStatus): PillTone {
  return pillTone(SLA_STATUS_TONES[status]);
}

export const ICON_TONES: Record<PillTone, IconTone> = {
  neutral: 'neutral',
  info: 'info',
  progress: 'primary',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
};

/**
 * The leading mark of a ticket: what state it is in, at a glance.
 *
 * A breached SLA wins over the status, because it is the one thing about the ticket that is
 * already late.
 */
export function ticketMark(
  status: TicketStatus,
  slaBreached: boolean,
): { icon: IconName; tone: IconTone } {
  if (slaBreached) {
    return { icon: 'speedometer-outline', tone: 'danger' };
  }
  const tone = ICON_TONES[ticketTone(status)];
  switch (status) {
    case TICKET_STATUS.WAITING_CLIENT:
      return { icon: 'hourglass-outline', tone };
    case TICKET_STATUS.RESOLVED:
    case TICKET_STATUS.CLOSED:
      return { icon: 'checkmark-done-outline', tone };
    case TICKET_STATUS.ESCALATED:
      return { icon: 'trending-up', tone };
    case TICKET_STATUS.CANCELLED:
      return { icon: 'close-circle-outline', tone };
    default:
      return { icon: 'ticket-outline', tone };
  }
}

/** The same mark for a client, who only ever has the client-visible status to go on. */
export function portalTicketMark(
  status: ClientVisibleStatus,
  slaBreached: boolean,
): { icon: IconName; tone: IconTone } {
  if (slaBreached) {
    return { icon: 'speedometer-outline', tone: 'danger' };
  }
  const tone = ICON_TONES[clientTicketTone(status)];
  switch (status) {
    case CLIENT_VISIBLE_STATUS.WAITING_FOR_YOU:
      return { icon: 'hourglass-outline', tone };
    case CLIENT_VISIBLE_STATUS.COMPLETED:
      return { icon: 'checkmark-done-outline', tone };
    case CLIENT_VISIBLE_STATUS.CLOSED:
      return { icon: 'close-circle-outline', tone };
    default:
      return { icon: 'ticket-outline', tone };
  }
}

/**
 * Whether the API offered this action to this caller on this ticket.
 *
 * The whole decision is the server's; the constant only names which entry to look for. A missing
 * entry and a disabled one are the same answer here.
 */
export function ticketCan(
  actions: readonly TicketActionAvailability[],
  action: TicketAction,
): boolean {
  return actions.some((entry) => entry.action === action && entry.enabled);
}

/**
 * Whether a refused action is still worth showing, greyed out with the API's reason.
 *
 * The same rule as the web: "Not available while <status>" only says the ticket is elsewhere in
 * its life, which the status pill already says, so those are hidden rather than listed.
 */
export function actionWorthShowing(entry: TicketActionAvailability | undefined): boolean {
  return Boolean(entry && (entry.enabled || !entry.reason?.startsWith('Not available while')));
}

/** One line of the activity timeline, in the web's words. */
export function describeHistory(entry: TicketHistoryEntry): string {
  if (!entry.fromStatus) {
    return 'raised the ticket';
  }
  if (entry.fromStatus === entry.toStatus) {
    return 'updated it';
  }
  return `moved it from ${TICKET_STATUS_LABELS[entry.fromStatus]} to ${TICKET_STATUS_LABELS[entry.toStatus]}`;
}

/** The roles the web offers when a ticket is assigned or converted: people who do the work. */
const WORKER_ROLES: readonly RoleKey[] = [
  ROLE_KEYS.DEVELOPER,
  ROLE_KEYS.TEAM_LEAD,
  ROLE_KEYS.TESTER,
  ROLE_KEYS.SUPPORT_EXECUTIVE,
  ROLE_KEYS.PROJECT_MANAGER,
  ROLE_KEYS.SUPER_ADMIN,
];
const TESTER_ROLES: readonly RoleKey[] = [ROLE_KEYS.TESTER, ROLE_KEYS.TEAM_LEAD];

export const isWorker = (person: DirectoryEntry): boolean => WORKER_ROLES.includes(person.roleKey);
export const isTester = (person: DirectoryEntry): boolean => TESTER_ROLES.includes(person.roleKey);
