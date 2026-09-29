import { PERMISSIONS, REAUTH_HEADER, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { CATALOG, fakeApi, role, type ApiCall } from '../shared/admin-test-data';
import { RoleDetailScreen } from './RoleDetailScreen';

/**
 * The permission matrix. Switches edit a draft with a running count of unsaved changes; Save
 * sends the whole set once, after the password check. A system role shows the same switches,
 * locked, and offers nothing to save.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as { restoreSession: jest.Mock };

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: 'SUPER_ADMIN', permissions }),
  });
}

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  let stored = role();
  api = fakeApi({
    'GET /roles/permissions': CATALOG,
    'GET /roles/role-support': () => stored,
    'PATCH /roles/role-support': (call: ApiCall) => {
      const { permissions } = call.body as { permissions: PermissionKey[] };
      stored = role({ permissions, updatedAt: '2026-09-29T09:00:00.000Z' });
      return stored;
    },
    'GET /roles/role-dev': role({
      id: 'role-dev',
      key: 'DEVELOPER',
      name: 'Developer',
      isSystem: true,
      templateKey: null,
      permissions: ['task:read'],
      memberCount: 6,
    }),
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    'DELETE /roles/role-support': {},
  });
  globalThis.fetch = api.fetch;
});

it('groups the permissions by area with what is on', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const view = await renderScreen(<RoleDetailScreen roleId="role-support" onDeleted={jest.fn()} />);

  expect(await view.findByText('Support lead')).toBeTruthy();
  expect(view.getByText('1 of 3 permissions on')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Tickets' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Tasks' })).toBeTruthy();
});

it('counts unsaved changes and saves them with the password confirmed', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const view = await renderScreen(<RoleDetailScreen roleId="role-support" onDeleted={jest.fn()} />);
  await view.findByText('Support lead');

  await fireEvent.changeText(view.getByLabelText('Search permissions'), 'tickets');
  await fireEvent(view.getByLabelText('Triage tickets'), 'valueChange', true);
  expect(view.getByText('1 unsaved change')).toBeTruthy();
  expect(api.find('PATCH', '/roles/role-support')).toHaveLength(0);

  await fireEvent(view.getByLabelText('View tickets'), 'valueChange', false);
  expect(view.getByText('2 unsaved changes')).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Save role' }));

  // The refetched role replaces the draft: nothing is left showing as unsaved.
  await waitFor(() => expect(view.queryByText('2 unsaved changes')).toBeNull());
  expect(view.getByText('1 of 3 permissions on')).toBeTruthy();
  const saved = api.find('PATCH', '/roles/role-support')[0];
  expect(saved?.headers[REAUTH_HEADER]).toBe('reauth-1');
  expect(saved?.body).toEqual({ permissions: ['ticket:triage'] });
});

it('discards the draft', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const view = await renderScreen(<RoleDetailScreen roleId="role-support" onDeleted={jest.fn()} />);
  await view.findByText('Support lead');

  await fireEvent.changeText(view.getByLabelText('Search permissions'), 'tasks');
  await fireEvent(view.getByLabelText('View tasks'), 'valueChange', true);
  await fireEvent.press(view.getByRole('button', { name: 'Discard' }));

  expect(view.queryByText('1 unsaved change')).toBeNull();
  expect(view.getByText('1 of 3 permissions on')).toBeTruthy();
});

it('deletes a role nobody holds', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const onDeleted = jest.fn();
  const view = await renderScreen(<RoleDetailScreen roleId="role-support" onDeleted={onDeleted} />);
  await view.findByText('Support lead');

  await fireEvent.press(view.getByRole('button', { name: 'Delete' }));
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Delete role' }));

  await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  expect(api.find('DELETE', '/roles/role-support')[0]?.headers[REAUTH_HEADER]).toBe('reauth-1');
});

it('shows a system role locked, with nothing to save', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const view = await renderScreen(<RoleDetailScreen roleId="role-dev" onDeleted={jest.fn()} />);

  expect(await view.findByText('System roles are fixed')).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('Search permissions'), 'tasks');
  expect(view.getByLabelText('View tasks')).toBeDisabled();
  expect(view.queryByRole('button', { name: 'Save' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Delete' })).toBeNull();
});
