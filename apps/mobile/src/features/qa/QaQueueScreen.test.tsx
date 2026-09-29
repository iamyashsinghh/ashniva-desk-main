import {
  PERMISSIONS,
  TESTER_VIEW,
  TEST_ENVIRONMENT,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type TesterQueue,
  type TesterViewCounts,
} from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { QaQueueScreen } from './QaQueueScreen';

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const COUNTS = Object.fromEntries(
  Object.values(TESTER_VIEW).map((view) => [view, 0]),
) as TesterViewCounts;

function queue(overrides: Partial<TesterQueue> = {}): TesterQueue {
  return {
    counts: { ...COUNTS, mine: 1, overdue: 3 },
    queue: [
      {
        id: 'qa1',
        kind: TESTING_ASSIGNMENT_KIND.QA,
        status: TESTING_ASSIGNMENT_STATUS.PENDING,
        environment: TEST_ENVIRONMENT.STAGING,
        projectId: 'p1',
        projectName: 'Northwind portal',
        subjectLabel: 'Saved cards at checkout',
        taskId: 't1',
        ticketId: null,
        releaseId: null,
        assignedToUserId: null,
        assignedToName: null,
        dueAt: null,
        isOverdue: false,
        startedAt: null,
        completedAt: null,
        updatedAt: '2026-09-01T09:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ permissions: [PERMISSIONS.QA_RECORD_RESULT] }),
  });
});

it('shows all nine views with the counts that came back, and opens a row', async () => {
  fetchMock.mockResolvedValue(jsonResponse(queue()));
  const onOpen = jest.fn();
  const view = await renderScreen(<QaQueueScreen onOpen={onOpen} />);

  expect(await view.findByRole('tab', { name: 'Overdue, 3' })).toBeTruthy();
  expect(view.getAllByRole('tab')).toHaveLength(9);
  await fireEvent.press(view.getByRole('button', { name: 'Saved cards at checkout' }));
  expect(onOpen).toHaveBeenCalledWith('qa1');
});

it('asks the server for the chosen view and says when it is empty', async () => {
  fetchMock.mockResolvedValue(jsonResponse(queue({ queue: [] })));
  const view = await renderScreen(<QaQueueScreen onOpen={jest.fn()} />);

  await fireEvent.press(await view.findByRole('tab', { name: 'Waiting for retest, 0' }));
  expect(await view.findByText('No assignments in "Waiting for retest" right now.')).toBeTruthy();
  expect(requestedPaths(fetchMock).some((path) => path.includes('view=retest'))).toBe(true);
});
