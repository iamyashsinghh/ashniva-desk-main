import { PERMISSIONS, ROLE_KEYS, type PermissionKey, type RoleKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { projectSummary, routeByPath } from './project-test-data';
import { ProjectsScreen } from './ProjectsScreen';

/**
 * The project list.
 *
 * Searching and "my projects" are the API's filters, not the phone's — so what is asserted is the
 * request. The two controls that change something only for some people are only drawn for them:
 * "New project" needs `project:manage`, and the scope switch only exists for the role that sees the
 * whole organization, because for everybody else the API already returns only their projects.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

function signIn(roleKey: RoleKey, permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey, permissions }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(routeByPath({ '/projects': [projectSummary()] }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('the list', () => {
  it('shows each project with its health, progress and people', async () => {
    signIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.PROJECT_READ]);
    const onOpen = jest.fn();
    const view = await renderScreen(<ProjectsScreen onOpen={onOpen} />);

    expect(await view.findByText('Acme portal')).toBeTruthy();
    expect(view.getByLabelText('Status: At risk')).toBeTruthy();
    expect(view.getByText('PM Priya Manager · Lead Lee Lead')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'ACM Acme portal' }));
    expect(onOpen).toHaveBeenCalledWith('p1');
  });

  it('searches on the server after a pause in typing', async () => {
    signIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.PROJECT_READ]);
    const view = await renderScreen(<ProjectsScreen onOpen={jest.fn()} />);
    await view.findByText('Acme portal');

    await fireEvent.changeText(view.getByLabelText('Search projects'), 'acm');
    await waitFor(() =>
      expect(requestedPaths(fetchMock).some((path) => path.includes('search=acm'))).toBe(true),
    );
  });
});

describe('who sees which controls', () => {
  it('offers neither the scope switch nor "New project" to a developer', async () => {
    signIn(ROLE_KEYS.DEVELOPER, [PERMISSIONS.PROJECT_READ]);
    const view = await renderScreen(<ProjectsScreen onOpen={jest.fn()} onCreate={jest.fn()} />);
    await view.findByText('Acme portal');

    expect(view.queryByRole('button', { name: 'New project' })).toBeNull();
    expect(view.queryByRole('tab', { name: 'My projects' })).toBeNull();
  });

  it('lets a super admin narrow to their projects and create one', async () => {
    signIn(ROLE_KEYS.SUPER_ADMIN, [PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_MANAGE]);
    const onCreate = jest.fn();
    const view = await renderScreen(<ProjectsScreen onOpen={jest.fn()} onCreate={onCreate} />);
    await view.findByText('Acme portal');

    await fireEvent.press(view.getByRole('tab', { name: 'My projects' }));
    await waitFor(() =>
      expect(requestedPaths(fetchMock).some((path) => path.includes('mine=true'))).toBe(true),
    );

    await fireEvent.press(view.getByRole('button', { name: 'New project' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
