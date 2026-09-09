import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { OPERATIONS_SCOPE, type OperationsScope } from '@ashniva/types';

import { sessionUserFor } from '../../test/fixtures';
import { setAuthenticated } from '../auth/session-store';
import { TasksPage } from '../tasks/pages/TasksPage';
import { TicketsPage } from '../tickets/pages/TicketsPage';
import {
  CARD_LINKS,
  OPERATIONS_TASK_FILTERS,
  OPERATIONS_TICKET_FILTERS,
  operationsTaskLink,
  operationsTicketLink,
  type OperationsTaskCard,
  type OperationsTicketCard,
} from './card-links';

/**
 * A dashboard card's link only keeps its promise if the destination page forwards every filter
 * in it to the API. A page that quietly drops one (the ticket list did exactly that with
 * `resolvedToday`) still renders happily — it just shows the wrong rows — so the assertion here
 * is on the request the page actually makes.
 */
function renderAt(url: string, element: React.ReactElement) {
  const requested: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    requested.push(typeof input === 'string' ? input : String(input));
    return Promise.resolve(
      new Response(JSON.stringify({ items: [], nextCursor: null, total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  setAuthenticated('test-token', sessionUserFor('SUPER_ADMIN'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const path = url.split('?')[0] ?? url;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requested;
}

/** The query the page sent to `resource`, as key/value pairs. */
async function sentQuery(requested: string[], resource: string) {
  await waitFor(() => {
    expect(requested.some((url) => url.includes(`/${resource}?`))).toBe(true);
  });
  const url = requested.find((entry) => entry.includes(`/${resource}?`)) ?? '';
  return new URLSearchParams(url.slice(url.indexOf('?')));
}

describe('dashboard card links reach the API intact', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [CARD_LINKS.overdueTasks, { view: 'all', overdue: 'true' }],
    [CARD_LINKS.teamDelayed, { view: 'team', overdue: 'true' }],
    [CARD_LINKS.myOverdue, { view: 'overdue' }],
    [CARD_LINKS.completedToday, { view: 'all', completedToday: 'true' }],
    [CARD_LINKS.teamCompletedToday, { view: 'team', completedToday: 'true' }],
    [CARD_LINKS.myCompletedToday, { view: 'done', completedToday: 'true' }],
    [CARD_LINKS.pendingReviews, { view: 'all', status: 'IN_REVIEW' }],
    [CARD_LINKS.teamUnderReview, { view: 'team', status: 'IN_REVIEW' }],
    [CARD_LINKS.myInProgress, { view: 'my', status: 'IN_PROGRESS' }],
    [CARD_LINKS.assignedByMe, { view: 'by-me' }],
    [CARD_LINKS.myToday, { view: 'today' }],
    [CARD_LINKS.myReviewQueue, { view: 'review' }],
  ])('%s', async (link, expected) => {
    const query = await sentQuery(renderAt(link, <TasksPage />), 'tasks');
    for (const [key, value] of Object.entries(expected)) {
      expect([key, query.get(key)]).toEqual([key, value]);
    }
  });

  it.each([
    [CARD_LINKS.slaAtRisk, { view: 'sla-at-risk' }],
    [CARD_LINKS.slaBreached, { view: 'sla-breached' }],
    [CARD_LINKS.criticalTickets, { view: 'critical' }],
    [CARD_LINKS.openTickets, { view: 'open' }],
    [CARD_LINKS.newTickets, { view: 'new' }],
    [CARD_LINKS.ticketsAssignedToMe, { view: 'mine' }],
    [CARD_LINKS.ticketsInProgress, { view: 'open', status: 'IN_PROGRESS' }],
    [CARD_LINKS.waitingForClient, { view: 'waiting' }],
    // Regression: the page read the view but dropped resolvedToday, so the card opened every
    // ticket ever resolved instead of today's.
    [CARD_LINKS.resolvedToday, { view: 'resolved', resolvedToday: 'true' }],
  ])('%s', async (link, expected) => {
    const query = await sentQuery(renderAt(link, <TicketsPage />), 'tickets');
    for (const [key, value] of Object.entries(expected)) {
      expect([key, query.get(key)]).toEqual([key, value]);
    }
  });

  /**
   * The operational dashboard's cards, for both scopes it can be built with. A team lead's cards
   * point at the team view and a manager's at the whole organization, and the filter on them has
   * to survive the trip in either case.
   */
  const SCOPES: OperationsScope[] = [
    { kind: OPERATIONS_SCOPE.ORGANIZATION, projectIds: ['project-a'], taskListView: 'all' },
    { kind: OPERATIONS_SCOPE.TEAM, projectIds: ['project-a'], taskListView: 'team' },
  ];

  const taskCases = SCOPES.flatMap((scope) =>
    (Object.keys(OPERATIONS_TASK_FILTERS) as OperationsTaskCard[]).map(
      (card) => [scope, card] as const,
    ),
  );

  it.each(taskCases)('operations %s task card: %s', async (scope, card) => {
    const link = operationsTaskLink(scope, card);
    const query = await sentQuery(renderAt(link, <TasksPage />), 'tasks');
    const expected = new URLSearchParams(link.slice(link.indexOf('?') + 1));
    for (const [key, value] of expected) {
      expect([key, query.get(key)]).toEqual([key, value]);
    }
  });

  const ticketCases = (Object.keys(OPERATIONS_TICKET_FILTERS) as OperationsTicketCard[]).flatMap(
    (card) => SCOPES.map((scope) => [scope, card] as const),
  );

  it.each(ticketCases)('operations %s ticket card: %s', async (scope, card) => {
    const link = operationsTicketLink(scope, card);
    expect(link).not.toBeNull();
    const query = await sentQuery(renderAt(link ?? '', <TicketsPage />), 'tickets');
    const expected = new URLSearchParams((link ?? '').slice((link ?? '').indexOf('?') + 1));
    for (const [key, value] of expected) {
      expect([key, query.get(key)]).toEqual([key, value]);
    }
  });

  // A card whose scope no list view can express must not link at all: pointing at a wider list
  // would show more rows than the number promised.
  it('refuses a ticket link when the scope covers several projects', () => {
    const scope: OperationsScope = {
      kind: OPERATIONS_SCOPE.TEAM,
      projectIds: ['project-a', 'project-b'],
      taskListView: 'team',
    };
    expect(operationsTicketLink(scope, 'escalated')).toBeNull();
  });

  it('reads the legacy status=overdue link as the overdue filter, keeping the view', async () => {
    const query = await sentQuery(
      renderAt('/tasks?view=all&status=overdue', <TasksPage />),
      'tasks',
    );
    expect(query.get('view')).toBe('all');
    expect(query.get('overdue')).toBe('true');
    // "overdue" was never a task status; sending it on would fail validation.
    expect(query.get('status')).toBeNull();
  });
});
