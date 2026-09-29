import { PRIORITY, TICKET_LIST_VIEW, TICKET_STATUS } from '@ashniva/types';

import { queryChips } from './ticket-query-chips';
import {
  activeFilterCount,
  defaultView,
  NO_FILTERS,
  ticketListQuery,
  viewOptions,
} from './ticket-views';

describe('ticket views', () => {
  it('gives an employee only their own and resolved tickets, starting with their own', () => {
    expect(viewOptions('employee').map((option) => option.value)).toEqual([
      TICKET_LIST_VIEW.MINE,
      TICKET_LIST_VIEW.RESOLVED,
    ]);
    expect(viewOptions('employee')[0]?.label).toBe('My tickets');
    expect(defaultView('employee')).toBe(TICKET_LIST_VIEW.MINE);
  });

  it('gives staff every view the web has, starting with open', () => {
    expect(viewOptions('staff').map((option) => option.value)).toEqual(
      Object.values(TICKET_LIST_VIEW),
    );
    expect(defaultView('staff')).toBe(TICKET_LIST_VIEW.OPEN);
  });
});

describe('ticketListQuery', () => {
  it('sends only the view when nothing is filtered', () => {
    expect(ticketListQuery(TICKET_LIST_VIEW.OPEN, NO_FILTERS, '')).toEqual({ view: 'open' });
  });

  it('joins statuses, keeps set filters and trims the search', () => {
    const filters = {
      ...NO_FILTERS,
      status: [TICKET_STATUS.NEW, TICKET_STATUS.IN_PROGRESS],
      priority: PRIORITY.HIGH,
      projectId: 'p1',
    };
    expect(ticketListQuery(TICKET_LIST_VIEW.ALL, filters, '  login ')).toEqual({
      view: 'all',
      status: `${TICKET_STATUS.NEW},${TICKET_STATUS.IN_PROGRESS}`,
      priority: PRIORITY.HIGH,
      projectId: 'p1',
      search: 'login',
    });
    expect(activeFilterCount(filters)).toBe(3);
  });
});

describe('queryChips', () => {
  it('names ids from the rows it already has, and says "one" when it cannot', () => {
    const chips = queryChips(
      { view: 'sla-breached', projectId: 'p1', assignedToId: 'u9', resolvedToday: 'true' },
      [{ project: { id: 'p1', name: 'Storefront', code: 'SF' }, assignedTo: null }],
    );
    expect(chips.map((chip) => chip.label)).toEqual([
      'SLA breached',
      'Storefront',
      'One assignee',
      'Resolved today',
    ]);
  });
});
