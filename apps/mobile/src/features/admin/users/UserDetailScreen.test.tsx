import { PERMISSIONS, REAUTH_HEADER, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { fakeApi, person, Reply } from '../shared/admin-test-data';
import { UserDetailScreen } from './UserDetailScreen';

/**
 * One person. Deactivating asks first and sends nothing until confirmed; changing a role checks
 * the signed-in person's password and carries the re-auth token the API demands; nobody is offered
 * a change to their own account.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as { restoreSession: jest.Mock };

const ME = sessionUser().id;

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ roleKey: 'SUPER_ADMIN', permissions }),
  });
}

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  api = fakeApi({
    'GET /users/user-asha': person(),
    [`GET /users/${ME}`]: person({ id: ME, name: 'Sam Patel' }),
    'POST /users/user-asha/deactivate': person({ status: 'SUSPENDED' }),
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    'POST /users/user-asha/role': person({ roleKey: 'TESTER', roleName: 'Tester' }),
  });
  globalThis.fetch = api.fetch;
});

it('shows the profile and the account actions', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<UserDetailScreen userId="user-asha" onDeleted={jest.fn()} />);

  expect(await view.findByText('Asha Rao')).toBeTruthy();
  expect(view.getByText('Backend developer')).toBeTruthy();
  expect(view.getByText('Deactivate')).toBeTruthy();
  expect(view.getByText('Delete')).toBeTruthy();
  // Signed in before, so there is no invitation to resend.
  expect(view.queryByText('New invitation link')).toBeNull();
});

it('deactivates only after the confirmation', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<UserDetailScreen userId="user-asha" onDeleted={jest.fn()} />);
  await view.findByText('Asha Rao');

  await fireEvent.press(view.getByRole('button', { name: /^Deactivate/ }));
  expect(await view.findByText('Deactivate Asha Rao?')).toBeTruthy();
  expect(api.find('POST', '/users/user-asha/deactivate')).toHaveLength(0);

  const buttons = view.getAllByRole('button', { name: 'Deactivate' });
  await fireEvent.press(buttons[buttons.length - 1]!);
  await waitFor(() => expect(api.find('POST', '/users/user-asha/deactivate')).toHaveLength(1));
});

it('changes the role with the password confirmed first', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<UserDetailScreen userId="user-asha" onDeleted={jest.fn()} />);
  await view.findByText('Asha Rao');

  await fireEvent.press(view.getByRole('button', { name: 'Change role' }));
  await fireEvent.press(await view.findByRole('button', { name: 'New role: Developer' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'Tester / QA' }));
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Confirm change' }));

  await waitFor(() => expect(api.find('POST', '/users/user-asha/role')).toHaveLength(1));
  expect(api.find('POST', '/auth/reauth')[0]?.body).toEqual({ password: 'correct horse' });
  const change = api.find('POST', '/users/user-asha/role')[0];
  expect(change?.body).toEqual({ roleKey: 'TESTER' });
  expect(change?.headers[REAUTH_HEADER]).toBe('reauth-1');
});

it('says so when the password is wrong and changes nothing', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  api = fakeApi({
    'GET /users/user-asha': person(),
    'POST /auth/reauth': new Reply(
      { statusCode: 401, error: 'Unauthorized', message: 'Password is incorrect' },
      401,
    ),
  });
  globalThis.fetch = api.fetch;
  const view = await renderScreen(<UserDetailScreen userId="user-asha" onDeleted={jest.fn()} />);
  await view.findByText('Asha Rao');

  await fireEvent.press(view.getByRole('button', { name: 'Change role' }));
  await fireEvent.press(await view.findByRole('button', { name: 'New role: Developer' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'Tester / QA' }));
  await fireEvent.changeText(view.getByLabelText('Your password'), 'wrong');
  await fireEvent.press(view.getByRole('button', { name: 'Confirm change' }));

  expect(await view.findByText('Password is incorrect')).toBeTruthy();
  expect(api.find('POST', '/users/user-asha/role')).toHaveLength(0);
  // A typo is not an expired session: no refresh, so the admin stays signed in.
  expect(api.find('POST', '/auth/refresh')).toHaveLength(0);
  expect(view.queryByText('Not available to you')).toBeNull();
});

it('offers no account or role change on your own profile', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<UserDetailScreen userId={ME} onDeleted={jest.fn()} />);

  expect(await view.findByText('Sam Patel')).toBeTruthy();
  expect(view.queryByText('Deactivate')).toBeNull();
  expect(view.getByRole('button', { name: 'Change role' })).toBeDisabled();
});
