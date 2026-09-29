import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { ProjectFormScreen } from './ProjectFormScreen';
import { projectDetail, routeByPath } from './project-test-data';

/**
 * Creating and editing a project.
 *
 * A form that cannot be valid is not sent — the fields say what is missing instead — and an edit
 * sends a `PATCH` without the code, which the API does not let anyone change.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

function writes(method: string) {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(routeByPath({ '/projects/p1': projectDetail() }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      roleKey: ROLE_KEYS.SUPER_ADMIN,
      permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.PROJECT_MANAGE],
    }),
  });
});

it('says what is missing instead of sending an incomplete project', async () => {
  const view = await renderScreen(<ProjectFormScreen onSaved={jest.fn()} />);

  await fireEvent.press(await view.findByRole('button', { name: 'Create project' }));

  expect(await view.findByText('Choose who will lead this team.')).toBeTruthy();
  expect(view.getByText('Choose which team this project belongs to.')).toBeTruthy();
  expect(writes('POST')).toHaveLength(0);
});

it('edits from what is saved and never sends the code', async () => {
  const onSaved = jest.fn();
  const view = await renderScreen(<ProjectFormScreen projectId="p1" onSaved={onSaved} />);

  await fireEvent.changeText(await view.findByLabelText('Name'), 'Acme portal v2');
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('p1'));
  const [patch] = writes('PATCH');
  expect(String(patch?.[0])).toContain('/projects/p1');
  const body = JSON.parse(String((patch?.[1] as { body: string }).body)) as Record<string, unknown>;
  expect(body).toMatchObject({ name: 'Acme portal v2', leadUserId: 'lead-1', teamId: 'team-1' });
  expect('code' in body).toBe(false);
});
