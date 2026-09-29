import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import { renderScreen, requestedPaths, sessionUser } from '../../shared/testing/harness';
import { InternWorkScreen } from './InternWorkScreen';
import { internTask, routeRequests } from './intern-work-test-data';

/**
 * The intern-work board.
 *
 * It reads the web's own view, `view=intern`, and offers "Assign work" on exactly the web's rule:
 * a manager role that also holds `task:assign`.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

function signInAs(roleKey: (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS], canAssign: boolean) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey,
      permissions: canAssign
        ? [PERMISSIONS.TASK_READ, PERMISSIONS.TASK_ASSIGN]
        : [PERMISSIONS.TASK_READ],
    }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    routeRequests({ '/tasks': { items: [internTask()], nextCursor: null } }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('reads the intern view and opens a task', async () => {
  signInAs(ROLE_KEYS.INTERN, false);
  const onOpenTask = jest.fn();
  const view = await renderScreen(
    <InternWorkScreen onOpenTask={onOpenTask} onCreate={jest.fn()} />,
  );

  await fireEvent.press(await view.findByRole('button', { name: 'LRN-3 Build a todo app' }));

  expect(onOpenTask).toHaveBeenCalledWith('task-1');
  expect(requestedPaths(fetchMock).some((path) => path.includes('view=intern'))).toBe(true);
});

it('offers an intern no way to assign work', async () => {
  signInAs(ROLE_KEYS.INTERN, false);
  const view = await renderScreen(<InternWorkScreen onOpenTask={jest.fn()} onCreate={jest.fn()} />);

  expect(await view.findByText(/Work assigned to you/)).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Assign work' })).toBeNull();
});

it('offers a team lead with task:assign the create button', async () => {
  signInAs(ROLE_KEYS.TEAM_LEAD, true);
  const onCreate = jest.fn();
  const view = await renderScreen(<InternWorkScreen onOpenTask={jest.fn()} onCreate={onCreate} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Assign work' }));
  expect(onCreate).toHaveBeenCalled();
});

it('does not offer it to a manager role without task:assign', async () => {
  signInAs(ROLE_KEYS.PROJECT_MANAGER, false);
  const view = await renderScreen(<InternWorkScreen onOpenTask={jest.fn()} onCreate={jest.fn()} />);

  expect(await view.findByText(/Assign learning work to interns/)).toBeTruthy();
  await view.findByRole('button', { name: 'LRN-3 Build a todo app' });
  expect(view.queryByRole('button', { name: 'Assign work' })).toBeNull();
});

it('names an empty board for who is reading it', async () => {
  signInAs(ROLE_KEYS.TEAM_LEAD, true);
  fetchMock.mockImplementation(routeRequests({ '/tasks': { items: [], nextCursor: null } }));
  const view = await renderScreen(<InternWorkScreen onOpenTask={jest.fn()} />);

  expect(await view.findByText('No assignments yet')).toBeTruthy();
});
