import {
  ROLE_KEYS,
  TICKET_LIST_VIEW,
  type Priority,
  type SessionUser,
  type TicketListView,
  type TicketStatus,
  type TicketType,
} from '@ashniva/types';

import type { TabOption } from '../../shared/components/TabBar';
import { isClientUser } from '../auth/audience';

/**
 * Which ticket views somebody is offered, and how a view and its filters become a query.
 *
 * Mirrors the web's two list pages. Staff get every view; an internal employee only ever raises
 * tickets for themselves, so they get their own and the resolved ones; a client gets the portal's
 * views, which leave out the internal triage views (new, critical, the SLA queues).
 */

export type TicketAudience = 'staff' | 'employee' | 'client';

export function ticketAudience(user: SessionUser | null): TicketAudience {
  if (isClientUser(user)) {
    return 'client';
  }
  return user?.roleKey === ROLE_KEYS.INTERNAL_EMPLOYEE ? 'employee' : 'staff';
}

export const TICKET_VIEW_LABELS: Record<TicketListView, string> = {
  open: 'Open',
  new: 'New',
  mine: 'Mine',
  waiting: 'Waiting for client',
  critical: 'Critical',
  'sla-at-risk': 'SLA at risk',
  'sla-breached': 'SLA breached',
  resolved: 'Resolved',
  all: 'All',
};

const VIEW_ICONS: Record<TicketListView, TabOption<TicketListView>['icon']> = {
  open: 'folder-open-outline',
  new: 'sparkles-outline',
  mine: 'person-outline',
  waiting: 'hourglass-outline',
  critical: 'flame-outline',
  'sla-at-risk': 'alarm-outline',
  'sla-breached': 'speedometer-outline',
  resolved: 'checkmark-done-outline',
  all: 'albums-outline',
};

/** The portal's own wording: the client is the one being waited for, and "mine" is theirs. */
const PORTAL_VIEWS: readonly { value: TicketListView; label: string }[] = [
  { value: TICKET_LIST_VIEW.OPEN, label: 'Open' },
  { value: TICKET_LIST_VIEW.WAITING, label: 'Waiting for you' },
  { value: TICKET_LIST_VIEW.MINE, label: 'Raised by me' },
  { value: TICKET_LIST_VIEW.RESOLVED, label: 'Resolved' },
  { value: TICKET_LIST_VIEW.ALL, label: 'All' },
];

export function viewOptions(audience: TicketAudience): TabOption<TicketListView>[] {
  if (audience === 'client') {
    return PORTAL_VIEWS.map((view) => ({ ...view, icon: VIEW_ICONS[view.value] }));
  }
  const views =
    audience === 'employee'
      ? [TICKET_LIST_VIEW.MINE, TICKET_LIST_VIEW.RESOLVED]
      : Object.values(TICKET_LIST_VIEW);
  return views.map((value) => ({
    value,
    label:
      value === TICKET_LIST_VIEW.MINE && audience === 'employee'
        ? 'My tickets'
        : TICKET_VIEW_LABELS[value],
    icon: VIEW_ICONS[value],
  }));
}

export function defaultView(audience: TicketAudience): TicketListView {
  return audience === 'employee' ? TICKET_LIST_VIEW.MINE : TICKET_LIST_VIEW.OPEN;
}

export interface TicketFilters {
  status: TicketStatus[];
  priority: Priority | null;
  type: TicketType | null;
  projectId: string | null;
  assignedToId: string | null;
  clientOrganizationId: string | null;
}

export const NO_FILTERS: TicketFilters = {
  status: [],
  priority: null,
  type: null,
  projectId: null,
  assignedToId: null,
  clientOrganizationId: null,
};

export function activeFilterCount(filters: TicketFilters): number {
  return (
    (filters.status.length > 0 ? 1 : 0) +
    [
      filters.priority,
      filters.type,
      filters.projectId,
      filters.assignedToId,
      filters.clientOrganizationId,
    ].filter(Boolean).length
  );
}

/** The `GET /tickets` (or `/portal/tickets`) query for a view, its filters and a search. */
export function ticketListQuery(
  view: TicketListView,
  filters: TicketFilters,
  search: string,
): Record<string, string> {
  const query: Record<string, string> = { view };
  if (filters.status.length > 0) {
    query.status = filters.status.join(',');
  }
  const single = {
    priority: filters.priority,
    type: filters.type,
    projectId: filters.projectId,
    assignedToId: filters.assignedToId,
    clientOrganizationId: filters.clientOrganizationId,
  };
  for (const [key, value] of Object.entries(single)) {
    if (value) {
      query[key] = value;
    }
  }
  const term = search.trim();
  if (term) {
    query.search = term;
  }
  return query;
}
