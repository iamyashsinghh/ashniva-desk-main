import { OPERATIONS_SCOPE, TASK_STATUS, type OperationsScope } from '@ashniva/types';

import {
  CARD_LINKS,
  cardTarget,
  linkTarget,
  operationsTaskTarget,
  operationsTicketTarget,
  parseQuery,
} from './card-targets';

/**
 * A tile is a promise that the list it opens is the set it counted. These pin the translation
 * from the web's links to the phone's lists, and the destinations that deliberately go nowhere.
 */

const ORGANIZATION: OperationsScope = {
  kind: OPERATIONS_SCOPE.ORGANIZATION,
  projectIds: ['p1', 'p2'],
  taskListView: 'all',
};

function team(projectIds: string[]): OperationsScope {
  return { kind: OPERATIONS_SCOPE.TEAM, projectIds, taskListView: 'team' };
}

describe('parseQuery', () => {
  it('reads every pair, decoding values', () => {
    expect(parseQuery('view=all&status=IN_REVIEW%2CCODE_REVIEW')).toEqual({
      view: 'all',
      status: 'IN_REVIEW,CODE_REVIEW',
    });
  });

  it('is empty for an empty string and skips stray separators', () => {
    expect(parseQuery('')).toEqual({});
    expect(parseQuery('&view=new&')).toEqual({ view: 'new' });
  });
});

describe('cardTarget', () => {
  it('turns a task link into the task list with the same query', () => {
    expect(cardTarget('overdueTasks', 'Overdue tasks')).toEqual({
      kind: 'tasks',
      title: 'Overdue tasks',
      query: { view: 'all', overdue: 'true' },
    });
    expect(cardTarget('myCompletedToday', 'Completed today')).toEqual({
      kind: 'tasks',
      title: 'Completed today',
      query: { view: 'done', completedToday: 'true' },
    });
  });

  it('turns a ticket link into the ticket list with the same query', () => {
    expect(cardTarget('ticketsInProgress', 'In progress')).toEqual({
      kind: 'tickets',
      title: 'In progress',
      query: { view: 'open', status: 'IN_PROGRESS' },
    });
  });

  it('opens the ticket list unfiltered for a bare link', () => {
    expect(cardTarget('myTickets', 'My open tickets')).toEqual({
      kind: 'tickets',
      title: 'My open tickets',
      query: {},
    });
  });

  it('sends projects and approvals to their own screens', () => {
    expect(cardTarget('projectsAtRisk', 'At risk')).toEqual({ kind: 'projects' });
    expect(cardTarget('approvalsWaitingClient', 'Awaiting')).toEqual({ kind: 'approvals' });
  });

  it.each([
    'contractsExpiring',
    'openChangeRequests',
    'myReports',
    'updatesWaitingToPublish',
  ] as const)('has nowhere to send %s on the phone', (card) => {
    expect(cardTarget(card, 'x')).toBeNull();
  });

  it('maps every web link to a destination or a deliberate null', () => {
    for (const link of Object.values(CARD_LINKS)) {
      const target = linkTarget(link, 't');
      const path = link.split('?')[0];
      const expectsTarget = ['/tasks', '/tickets', '/projects', '/approvals'].includes(path ?? '');
      expect(target !== null).toBe(expectsTarget);
    }
  });
});

describe('operationsTaskTarget', () => {
  it('uses the view the API named for the scope', () => {
    expect(operationsTaskTarget(ORGANIZATION, 'scheduled', 'Scheduled today')).toEqual({
      kind: 'tasks',
      title: 'Scheduled today',
      query: { view: 'all', scheduledToday: 'true' },
    });
    expect(operationsTaskTarget(team(['p1']), 'overdue', 'Overdue')).toEqual({
      kind: 'tasks',
      title: 'Overdue',
      query: { view: 'team', overdue: 'true' },
    });
  });

  it('filters state cards by the shared status lists', () => {
    expect(operationsTaskTarget(ORGANIZATION, 'waitingForReview', 'Review')).toEqual({
      kind: 'tasks',
      title: 'Review',
      query: { view: 'all', status: `${TASK_STATUS.IN_REVIEW},${TASK_STATUS.CODE_REVIEW}` },
    });
    expect(operationsTaskTarget(ORGANIZATION, 'blocked', 'Blocked')).toMatchObject({
      query: { status: TASK_STATUS.BLOCKED },
    });
  });
});

describe('operationsTicketTarget', () => {
  it('opens the organization-wide list for a manager', () => {
    expect(operationsTicketTarget(ORGANIZATION, 'assigned', 'Assigned')).toEqual({
      kind: 'tickets',
      title: 'Assigned',
      query: { view: 'all', status: 'ASSIGNED,AUTO_ASSIGNED' },
    });
  });

  it('narrows to the one project a lead covers', () => {
    expect(operationsTicketTarget(team(['p9']), 'slaBreached', 'SLA breached')).toEqual({
      kind: 'tickets',
      title: 'SLA breached',
      query: { view: 'sla-breached', projectId: 'p9' },
    });
  });

  it('goes nowhere when a lead covers several projects, or none', () => {
    expect(operationsTicketTarget(team(['p1', 'p2']), 'newTickets', 'New')).toBeNull();
    expect(operationsTicketTarget(team([]), 'newTickets', 'New')).toBeNull();
  });
});
