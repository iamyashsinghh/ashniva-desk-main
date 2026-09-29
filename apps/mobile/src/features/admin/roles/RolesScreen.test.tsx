import { PERMISSIONS, REAUTH_HEADER, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { CLIENT_ORG_ID, COMPANY_OPTIONS, fakeApi, role } from '../shared/admin-test-data';
import { RolesScreen } from './RolesScreen';

/**
 * Roles & permissions. Custom and system roles are two views of one list; creating a role checks
 * the password and opens the new role, where its permissions are tuned.
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

const ROLES = [
  role(),
  role({ id: 'role-dev', key: 'DEVELOPER', name: 'Developer', isSystem: true, templateKey: null }),
];

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  api = fakeApi({
    'GET /roles': ROLES,
    'GET /organizations/options': COMPANY_OPTIONS,
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    'POST /roles': role({ id: 'role-new', name: 'Night shift' }),
  });
  globalThis.fetch = api.fetch;
});

it('lists custom roles first and system roles on their own tab', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const onOpenRole = jest.fn();
  const view = await renderScreen(<RolesScreen onOpenRole={onOpenRole} />);

  expect(await view.findByText('Support lead')).toBeTruthy();
  expect(view.queryByText('Developer')).toBeNull();

  await fireEvent.press(view.getByRole('tab', { name: 'System' }));
  expect(view.getByText('Developer')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'New custom role' })).toBeNull();
});

it('opens a role in the company it belongs to', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const onOpenRole = jest.fn();
  const view = await renderScreen(
    <RolesScreen organizationId={CLIENT_ORG_ID} onOpenRole={onOpenRole} />,
  );
  await view.findByText('Support lead');

  expect(api.find('GET', '/roles')[0]?.query).toEqual({ organizationId: CLIENT_ORG_ID });
  await fireEvent.press(view.getByText('Support lead'));
  expect(onOpenRole).toHaveBeenCalledWith('role-support', CLIENT_ORG_ID);
});

it('creates a custom role after the password check and opens it', async () => {
  signIn([PERMISSIONS.ROLE_MANAGE]);
  const onOpenRole = jest.fn();
  const view = await renderScreen(<RolesScreen onOpenRole={onOpenRole} />);
  await view.findByText('Support lead');

  await fireEvent.press(view.getByRole('button', { name: 'New custom role' }));
  await fireEvent.changeText(view.getByLabelText('Role name'), 'Night shift');
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Create role' }));

  await waitFor(() => expect(onOpenRole).toHaveBeenCalledWith('role-new', undefined));
  const created = api.find('POST', '/roles')[0];
  expect(created?.headers[REAUTH_HEADER]).toBe('reauth-1');
  expect(created?.body).toMatchObject({ name: 'Night shift' });
});

it('is closed to someone without role:manage', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<RolesScreen onOpenRole={jest.fn()} />);

  expect(await view.findByText('Not available to you')).toBeTruthy();
  expect(api.calls).toHaveLength(0);
});
