import {
  OPERATIONS_SCOPE,
  PERMISSIONS,
  ROLE_KEYS,
  TASK_STATUS,
  type DeveloperDashboard,
  type OperationsDashboard,
  type OperationsScope,
} from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { HomeScreen } from './HomeScreen';

/**
 * The role dashboard on Home. A tile is a promise that the list it opens is the one it counted, so
 * these press tiles and check the exact query handed to the list screen — and that a tile with no
 * list on the phone is not a button at all.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const DEVELOPER: DeveloperDashboard = {
  kind: 'developer',
  kpis: { today: 2, inProgress: 1, overdue: 3, blocked: 0, completedToday: 4, minutesToday: 90 },
  todayTasks: [],
  inProgressTasks: [],
  overdueTasks: [],
  blockedTasks: [],
  reviewResults: [],
};

function operations(scope: OperationsScope): OperationsDashboard {
  return {
    kind: 'operations',
    scope,
    projects: [],
    today: {
      scheduled: 5,
      started: 2,
      completed: 1,
      overdue: 0,
      upcoming: 3,
      blocked: 1,
      returnedToDeveloper: 0,
      waitingForReview: 2,
      waitingForQa: 1,
    },
    time: {
      inHand: 0,
      atRisk: 0,
      delayed: 0,
      unscheduled: 0,
      completedOnTime: 0,
      completedLate: 0,
      completedUnscheduled: 0,
      estimateMinutes: 0,
      loggedMinutes: 0,
      tasks: [],
    },
    support: {
      newTickets: 4,
      assigned: 1,
      unacknowledged: 0,
      escalated: 0,
      slaAtRisk: 0,
      slaBreached: 0,
      attention: [],
    },
    release: {
      qaWaiting: 0,
      qaFailed: 0,
      qaPassed: 0,
      uatPending: 0,
      blockers: 0,
      readyToRelease: 0,
      releases: [],
    },
  };
}

function serve(routes: { dashboard?: unknown; operations?: unknown }) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/dashboard/operations')) {
      return jsonResponse(routes.operations ?? {});
    }
    if (url.includes('/dashboard')) {
      return jsonResponse(routes.dashboard ?? {});
    }
    return jsonResponse({ kpis: { pendingApprovals: 0 } });
  });
}

function signIn(roleKey: (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey, permissions: [PERMISSIONS.PROJECT_READ] }),
  });
}

function handlers() {
  return {
    onOpenProjects: jest.fn(),
    onOpenConversations: jest.fn(),
    onOpenQa: jest.fn(),
    onOpenApprovals: jest.fn(),
    onOpenSignOffs: jest.fn(),
    onOpenMyTime: jest.fn(),
    onOpenTaskList: jest.fn(),
    onOpenTicketList: jest.fn(),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('a developer', () => {
  beforeEach(() => {
    signIn(ROLE_KEYS.DEVELOPER);
    serve({ dashboard: DEVELOPER });
  });

  it('opens the exact list a tile counted', async () => {
    const props = handlers();
    const view = await renderScreen(<HomeScreen {...props} />);

    await fireEvent.press(await view.findByRole('button', { name: 'Overdue: 3' }));
    expect(props.onOpenTaskList).toHaveBeenCalledWith({
      title: 'Overdue',
      query: { view: 'overdue' },
    });
  });

  it('shows a number with no list on the phone, but not as a button', async () => {
    const view = await renderScreen(<HomeScreen {...handlers()} />);

    expect(await view.findByLabelText(/^Time today: /)).toBeTruthy();
    expect(view.queryByRole('button', { name: /^Time today/ })).toBeNull();
  });

  it('is not offered the operations board, and never asks for it', async () => {
    const view = await renderScreen(<HomeScreen {...handlers()} />);

    await view.findByRole('button', { name: 'Due today: 2' });
    expect(view.queryByRole('tab', { name: 'Operations' })).toBeNull();
    expect(requestedPaths(fetchMock).some((path) => path.includes('/operations'))).toBe(false);
  });
});

describe('a project manager', () => {
  beforeEach(() => {
    signIn(ROLE_KEYS.PROJECT_MANAGER);
    serve({
      operations: operations({
        kind: OPERATIONS_SCOPE.ORGANIZATION,
        projectIds: ['p1', 'p2'],
        taskListView: 'all',
      }),
    });
  });

  it('switches to the operations board, whose tiles open the organization-wide list', async () => {
    const props = handlers();
    const view = await renderScreen(<HomeScreen {...props} />);

    await fireEvent.press(await view.findByRole('tab', { name: 'Operations' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Waiting for review: 2' }));
    expect(props.onOpenTaskList).toHaveBeenCalledWith({
      title: 'Waiting for review',
      query: { view: 'all', status: `${TASK_STATUS.IN_REVIEW},${TASK_STATUS.CODE_REVIEW}` },
    });

    await fireEvent.press(view.getByRole('button', { name: 'New tickets: 4' }));
    expect(props.onOpenTicketList).toHaveBeenCalledWith({
      title: 'New tickets',
      query: { view: 'new' },
    });
  });
});

describe('a team lead across several projects', () => {
  beforeEach(() => {
    signIn(ROLE_KEYS.TEAM_LEAD);
    serve({
      operations: operations({
        kind: OPERATIONS_SCOPE.TEAM,
        projectIds: ['p1', 'p2'],
        taskListView: 'team',
      }),
    });
  });

  it('gets the team view for tasks, and support tiles that say why they do not open', async () => {
    const props = handlers();
    const view = await renderScreen(<HomeScreen {...props} />);

    await fireEvent.press(await view.findByRole('tab', { name: 'Operations' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Scheduled today: 5' }));
    expect(props.onOpenTaskList).toHaveBeenCalledWith({
      title: 'Scheduled today',
      query: { view: 'team', scheduledToday: 'true' },
    });

    expect(view.queryByRole('button', { name: /^New tickets/ })).toBeNull();
    expect(view.getByLabelText('New tickets: 4, Covers several projects')).toBeTruthy();
  });
});
