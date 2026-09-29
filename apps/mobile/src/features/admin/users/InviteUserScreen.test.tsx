import { PERMISSIONS, REAUTH_HEADER, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { CLIENT_ORG_ID, COMPANY_OPTIONS, fakeApi, person } from '../shared/admin-test-data';
import { InviteUserScreen } from './InviteUserScreen';

/**
 * Adding a person. Nothing is sent until the form is complete and the password is confirmed; the
 * invitation link comes back to be shared; a client company is offered only client roles.
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

const INVITED = {
  ...person({ id: 'user-new', name: 'Nina New', email: 'nina@example.com', status: 'INVITED' }),
  invitation: { link: 'https://desk.example/invite/abc', expiresAt: '2026-10-06T00:00:00.000Z' },
};

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  api = fakeApi({
    'GET /organizations/options': COMPANY_OPTIONS,
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    'POST /users': INVITED,
  });
  globalThis.fetch = api.fetch;
});

async function fillIn(view: Awaited<ReturnType<typeof renderScreen>>) {
  await fireEvent.changeText(view.getByLabelText('Email'), 'nina@example.com');
  await fireEvent.changeText(view.getByLabelText('Name'), 'Nina New');
}

it('invites a person after the password check and shows the link', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const onOpenUser = jest.fn();
  const view = await renderScreen(<InviteUserScreen onOpenUser={onOpenUser} onDone={jest.fn()} />);

  const invite = await view.findByRole('button', { name: 'Invite' });
  expect(invite).toBeDisabled();
  await fillIn(view);
  await waitFor(() => expect(view.getByRole('button', { name: 'Invite' })).toBeEnabled());
  await fireEvent.press(view.getByRole('button', { name: 'Invite' }));
  expect(api.find('POST', '/users')).toHaveLength(0);

  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Create person' }));

  expect(await view.findByText('https://desk.example/invite/abc')).toBeTruthy();
  const created = api.find('POST', '/users')[0];
  expect(created?.headers[REAUTH_HEADER]).toBe('reauth-1');
  expect(created?.body).toEqual({
    email: 'nina@example.com',
    name: 'Nina New',
    roleKey: 'DEVELOPER',
    showDevelopmentSection: true,
  });

  await fireEvent.press(view.getByRole('button', { name: 'Open profile' }));
  expect(onOpenUser).toHaveBeenCalledWith('user-new', undefined);
});

it('adds a client’s person to that company with a client role', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(
    <InviteUserScreen organizationId={CLIENT_ORG_ID} onOpenUser={jest.fn()} onDone={jest.fn()} />,
  );

  expect(await view.findByText('Adding to Acme Retail')).toBeTruthy();
  await fillIn(view);
  await waitFor(() => expect(view.getByRole('button', { name: 'Invite' })).toBeEnabled());
  await fireEvent.press(view.getByRole('button', { name: 'Invite' }));
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Create person' }));

  await waitFor(() => expect(api.find('POST', '/users')).toHaveLength(1));
  expect(api.find('POST', '/users')[0]?.body).toMatchObject({
    organizationId: CLIENT_ORG_ID,
    roleKey: 'CLIENT_EMPLOYEE',
  });
});

it('asks for ten characters when you set the password yourself', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<InviteUserScreen onOpenUser={jest.fn()} onDone={jest.fn()} />);
  await view.findByRole('button', { name: 'Invite' });

  await fillIn(view);
  await fireEvent.press(view.getByRole('tab', { name: 'Set a password' }));
  await fireEvent.changeText(view.getByLabelText('Initial password'), 'short');

  expect(view.getByText('At least 10 characters.')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Add person' })).toBeDisabled();
});
