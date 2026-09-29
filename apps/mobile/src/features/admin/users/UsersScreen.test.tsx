import { PERMISSIONS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { CLIENT_ORG_ID, COMPANY_OPTIONS, fakeApi, person } from '../shared/admin-test-data';
import { UsersScreen } from './UsersScreen';

/**
 * Users & teams. Search and the status chips are the API's filters, so what is asserted is the
 * request; the company a list is scoped to travels as `organizationId` only when it is not the
 * signed-in person's own.
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
  api = fakeApi({
    'GET /users': [person(), person({ id: 'user-ben', name: 'Ben Invited', status: 'INVITED' })],
    'GET /organizations/options': COMPANY_OPTIONS,
    'GET /teams': [
      {
        id: 'team-web',
        name: 'Web team',
        description: null,
        lead: null,
        members: [{ id: 'user-asha', name: 'Asha Rao', email: 'asha@example.com' }],
        createdAt: '2026-02-01T09:00:00.000Z',
      },
    ],
  });
  globalThis.fetch = api.fetch;
});

it('lists the people of your own company and opens one', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const onOpenUser = jest.fn();
  const view = await renderScreen(<UsersScreen onOpenUser={onOpenUser} onInvite={jest.fn()} />);

  expect(await view.findByText('Asha Rao')).toBeTruthy();
  expect(view.getByText('2 people')).toBeTruthy();
  expect(api.find('GET', '/users')[0]?.query).toEqual({});

  await fireEvent.press(view.getByRole('button', { name: 'Ben Invited, Developer, Invited' }));
  expect(onOpenUser).toHaveBeenCalledWith('user-ben', undefined);
});

it('filters by status and searches on the server', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<UsersScreen onOpenUser={jest.fn()} onInvite={jest.fn()} />);
  await view.findByText('Asha Rao');

  await fireEvent.press(view.getByRole('button', { name: 'Suspended' }));
  await waitFor(() =>
    expect(api.find('GET', '/users').some((call) => call.query.status === 'SUSPENDED')).toBe(true),
  );

  await fireEvent.changeText(view.getByLabelText('Search name or email'), 'ben');
  await waitFor(() =>
    expect(api.find('GET', '/users').some((call) => call.query.search === 'ben')).toBe(true),
  );
});

it('scopes the list and new people to a client company', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const onInvite = jest.fn();
  const view = await renderScreen(
    <UsersScreen organizationId={CLIENT_ORG_ID} onOpenUser={jest.fn()} onInvite={onInvite} />,
  );
  await view.findByText('Asha Rao');

  expect(api.find('GET', '/users')[0]?.query).toEqual({ organizationId: CLIENT_ORG_ID });
  expect(view.queryByRole('tab', { name: 'Teams' })).toBeNull();

  await fireEvent.press(view.getByRole('button', { name: 'Add person' }));
  expect(onInvite).toHaveBeenCalledWith(CLIENT_ORG_ID);
});

it('shows the teams of the provider’s own company', async () => {
  signIn([PERMISSIONS.USER_MANAGE]);
  const view = await renderScreen(<UsersScreen onOpenUser={jest.fn()} onInvite={jest.fn()} />);
  await view.findByText('Asha Rao');

  await fireEvent.press(await view.findByRole('tab', { name: 'Teams' }));
  expect(await view.findByText('Web team')).toBeTruthy();
});

it('is closed to someone without user:manage', async () => {
  signIn([PERMISSIONS.PROJECT_READ]);
  const view = await renderScreen(<UsersScreen onOpenUser={jest.fn()} onInvite={jest.fn()} />);

  expect(await view.findByText('Not available to you')).toBeTruthy();
  expect(api.calls).toHaveLength(0);
});
