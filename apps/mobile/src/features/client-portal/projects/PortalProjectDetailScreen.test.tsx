import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../../shared/testing/harness';
import { PortalProjectDetailScreen } from './PortalProjectDetailScreen';

/**
 * One project from the client's side. The sections are chips; the progress board is its own
 * request, made only once somebody opens it.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as {
  restoreSession: jest.Mock;
};

const fetchMock = jest.fn();

const PROJECT = {
  id: 'p1',
  code: 'WEB',
  name: 'Website rebuild',
  description: 'A faster site.',
  status: 'ACTIVE',
  progressPercent: 40,
  taskCounts: { total: 1, open: 1, inProgress: 1, completed: 0 },
  openTicketCount: 2,
  manager: { id: 'm1', name: 'Priya Rao', email: 'priya@example.com' },
  startDate: '2026-08-01',
  targetDate: '2026-12-01',
  lastUpdateAt: null,
  tasks: [
    {
      id: 't1',
      key: 'WEB-1',
      title: 'Build the checkout',
      status: 'IN_DEVELOPMENT',
      priority: 'HIGH',
      dueDate: null,
      completedAt: null,
      updatedAt: '2026-09-20T09:00:00.000Z',
    },
  ],
  milestones: [],
  updates: [],
  files: [],
};

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
      roleName: 'Client Employee',
      permissions: [PERMISSIONS.PROJECT_READ],
    }),
  });
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      String(url).includes('/progress')
        ? jsonResponse({ message: 'The board is resting' }, 404)
        : jsonResponse(PROJECT),
    ),
  );
});

it('opens on the overview from the portal endpoint, without loading the progress board', async () => {
  const view = await renderScreen(<PortalProjectDetailScreen projectId="p1" />);

  expect(await view.findByText('Website rebuild')).toBeTruthy();
  expect(requestedPaths(fetchMock)[0]).toContain('/portal/projects/p1');
  expect(requestedPaths(fetchMock).some((path) => path.includes('/progress'))).toBe(false);
});

it('shows the shared work items in their own section', async () => {
  const view = await renderScreen(<PortalProjectDetailScreen projectId="p1" />);

  await fireEvent.press(await view.findByRole('tab', { name: 'Work items · 1' }));

  expect(view.getByText('Build the checkout')).toBeTruthy();
});

it('asks for the progress board when that section is opened', async () => {
  const view = await renderScreen(<PortalProjectDetailScreen projectId="p1" />);

  await fireEvent.press(await view.findByRole('tab', { name: 'Progress' }));

  await waitFor(() =>
    expect(
      requestedPaths(fetchMock).some((path) => path.includes('/portal/projects/p1/progress')),
    ).toBe(true),
  );
  expect(await view.findByText('The board is resting')).toBeTruthy();
});
