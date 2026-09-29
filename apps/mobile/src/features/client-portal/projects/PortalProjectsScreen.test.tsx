import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../../shared/testing/harness';
import { PortalProjectsScreen } from './PortalProjectsScreen';

/**
 * A client's project list: what the portal endpoint returns, narrowed on the phone, and nothing
 * fetched at all for somebody whose role does not read projects.
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

const CLIENT_ORG = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Northwind',
  slug: 'northwind',
  isServiceProvider: false,
};

function client(permissions: PermissionKey[]) {
  return sessionUser({
    roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
    roleName: 'Client Employee',
    permissions,
    organization: CLIENT_ORG,
  });
}

function project(id: string, code: string, name: string, status = 'ACTIVE') {
  return {
    id,
    code,
    name,
    description: null,
    status,
    progressPercent: 40,
    taskCounts: { total: 10, open: 4, inProgress: 2, completed: 4 },
    openTicketCount: 1,
    manager: { id: 'm1', name: 'Priya Rao', email: 'priya@example.com' },
    startDate: '2026-08-01',
    targetDate: '2026-12-01',
    lastUpdateAt: '2026-09-20T09:00:00.000Z',
  };
}

const PROJECTS = [
  project('p1', 'WEB', 'Website rebuild'),
  project('p2', 'APP', 'Mobile app', 'ON_HOLD'),
];

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: client([PERMISSIONS.PROJECT_READ]),
  });
});

it('lists the projects the portal returns, with progress', async () => {
  fetchMock.mockResolvedValue(jsonResponse(PROJECTS));
  const view = await renderScreen(<PortalProjectsScreen onOpen={jest.fn()} />);

  expect(await view.findByText('Website rebuild')).toBeTruthy();
  expect(view.getByText('Mobile app')).toBeTruthy();
  expect(requestedPaths(fetchMock).some((path) => path.includes('/portal/projects'))).toBe(true);
  expect(requestedPaths(fetchMock).some((path) => path.includes('/api/projects'))).toBe(false);
});

it('narrows by search and by status, and says when nothing matches', async () => {
  fetchMock.mockResolvedValue(jsonResponse(PROJECTS));
  const view = await renderScreen(<PortalProjectsScreen onOpen={jest.fn()} />);
  await view.findByText('Website rebuild');

  await fireEvent.changeText(view.getByLabelText('Search projects'), 'app');
  expect(view.queryByText('Website rebuild')).toBeNull();
  expect(view.getByText('Mobile app')).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText('Search projects'), '');
  await fireEvent.press(view.getByRole('button', { name: 'Active' }));
  expect(view.getByText('Website rebuild')).toBeTruthy();
  expect(view.queryByText('Mobile app')).toBeNull();

  await fireEvent.changeText(view.getByLabelText('Search projects'), 'zzz');
  expect(view.getByText('Nothing matches')).toBeTruthy();
});

it('opens the project that was tapped', async () => {
  fetchMock.mockResolvedValue(jsonResponse(PROJECTS));
  const onOpen = jest.fn();
  const view = await renderScreen(<PortalProjectsScreen onOpen={onOpen} />);

  await fireEvent.press(await view.findByRole('button', { name: 'WEB Website rebuild' }));

  expect(onOpen).toHaveBeenCalledWith('p1');
});

it('shows the API’s own sentence when the list fails', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ message: 'Projects are unavailable' }, 404));
  const view = await renderScreen(<PortalProjectsScreen onOpen={jest.fn()} />);

  expect(await view.findByText('Projects are unavailable')).toBeTruthy();
});

it('fetches nothing for a role that does not read projects', async () => {
  restoreSession.mockResolvedValue({ status: 'signed-in', user: client([]) });
  const view = await renderScreen(<PortalProjectsScreen onOpen={jest.fn()} />);

  expect(await view.findByText('Projects are not shared with you')).toBeTruthy();
  expect(requestedPaths(fetchMock).some((path) => path.includes('/portal/projects'))).toBe(false);
});
