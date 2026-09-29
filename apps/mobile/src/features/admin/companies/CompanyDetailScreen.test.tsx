import { PERMISSIONS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { CLIENT_ORG_ID, company, fakeApi, person } from '../shared/admin-test-data';
import { CompanyDetailScreen } from './CompanyDetailScreen';

/**
 * One company. Its people and its roles are only offered to someone who may manage them, and the
 * people are read in that company's scope, not the signed-in person's.
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

const CLIENT_USER = person({
  id: 'user-cara',
  name: 'Cara Client',
  email: 'cara@acme.example',
  roleKey: 'CLIENT_ADMIN',
  roleName: 'Client Admin',
  organization: { id: CLIENT_ORG_ID, name: 'Acme Retail', slug: 'acme' },
  teams: [],
});

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  api = fakeApi({
    [`GET /organizations/${CLIENT_ORG_ID}`]: company(),
    [`PATCH /organizations/${CLIENT_ORG_ID}`]: company({ name: 'Acme Retail Group' }),
    'GET /users': [CLIENT_USER],
  });
  globalThis.fetch = api.fetch;
});

function renderDetail(overrides: Partial<Parameters<typeof CompanyDetailScreen>[0]> = {}) {
  return renderScreen(
    <CompanyDetailScreen
      organizationId={CLIENT_ORG_ID}
      onOpenUser={jest.fn()}
      onInvite={jest.fn()}
      onOpenPeople={jest.fn()}
      onOpenRoles={jest.fn()}
      {...overrides}
    />,
  );
}

it('shows the company, its counts and its people from that company', async () => {
  signIn([PERMISSIONS.ORGANIZATION_MANAGE, PERMISSIONS.USER_MANAGE, PERMISSIONS.ROLE_MANAGE]);
  const onOpenUser = jest.fn();
  const onInvite = jest.fn();
  const view = await renderDetail({ onOpenUser, onInvite });

  expect(await view.findByText('Acme Retail')).toBeTruthy();
  expect(view.getByText('Open tickets')).toBeTruthy();
  expect(await view.findByText('Cara Client')).toBeTruthy();
  expect(api.find('GET', '/users')[0]?.query).toEqual({ organizationId: CLIENT_ORG_ID });

  await fireEvent.press(view.getByRole('button', { name: 'Cara Client, Client Admin, Active' }));
  expect(onOpenUser).toHaveBeenCalledWith('user-cara', CLIENT_ORG_ID);

  await fireEvent.press(view.getByRole('button', { name: 'Add person' }));
  expect(onInvite).toHaveBeenCalledWith(CLIENT_ORG_ID);
  expect(view.getByText('Roles & permissions')).toBeTruthy();
});

it('leaves out people and roles without the permissions to manage them', async () => {
  signIn([PERMISSIONS.ORGANIZATION_MANAGE]);
  const view = await renderDetail();

  expect(await view.findByText('Acme Retail')).toBeTruthy();
  expect(view.queryByText('Add person')).toBeNull();
  expect(view.queryByText('Roles & permissions')).toBeNull();
  expect(api.find('GET', '/users')).toHaveLength(0);
});

it('renames the company', async () => {
  signIn([PERMISSIONS.ORGANIZATION_MANAGE]);
  const view = await renderDetail();
  await view.findByText('Acme Retail');

  await fireEvent.press(view.getByRole('button', { name: 'Edit company' }));
  await fireEvent.changeText(view.getByLabelText('Company name'), 'Acme Retail Group');
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(api.find('PATCH', `/organizations/${CLIENT_ORG_ID}`)).toHaveLength(1));
  expect(api.find('PATCH', `/organizations/${CLIENT_ORG_ID}`)[0]?.body).toMatchObject({
    name: 'Acme Retail Group',
  });
});
