import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { ProjectMembersScreen } from './ProjectMembersScreen';
import { projectDetail, routeByPath } from './project-test-data';

/**
 * The team editor. Edits are a draft until "Save team", which sends the whole list in one `PUT` —
 * so removing somebody is proved by their absence from that one body.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(routeByPath({ '/projects/p1': projectDetail() }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('sends the edited team in one PUT and reports back', async () => {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.PROJECT_MANAGER,
      permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_MANAGE],
    }),
  });
  const onSaved = jest.fn();
  const view = await renderScreen(<ProjectMembersScreen projectId="p1" onSaved={onSaved} />);
  await view.findByText('Quinn Tester');

  await fireEvent.press(view.getByHintText('Takes Quinn Tester off this project'));
  await fireEvent.press(view.getByRole('button', { name: 'Save team' }));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const put = fetchMock.mock.calls.find(
    (call) => (call[1] as { method?: string } | undefined)?.method === 'PUT',
  );
  expect(String(put?.[0])).toContain('/projects/p1/members');
  expect(JSON.parse(String((put?.[1] as { body: string }).body))).toEqual({
    members: [{ userId: 'dev-1', role: 'DEVELOPER', responsibilities: ['API'] }],
  });
});

it('does not offer the editor to someone who may not change the team', async () => {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ permissions: [PERMISSIONS.PROJECT_READ] }),
  });
  const view = await renderScreen(<ProjectMembersScreen projectId="p1" onSaved={jest.fn()} />);

  expect(await view.findByText('Not available to you')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Save team' })).toBeNull();
});
