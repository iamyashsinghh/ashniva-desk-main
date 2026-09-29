import { PERMISSIONS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { company, fakeApi, OWN_ORG_ID } from '../shared/admin-test-data';
import { CompaniesScreen } from './CompaniesScreen';

/**
 * Companies & clients. The list is filtered on the phone (the endpoint returns every company), so
 * search and the type chips are asserted on what is drawn; creating one is asserted on the request.
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

const COMPANIES = [
  company({
    id: OWN_ORG_ID,
    name: 'Ashniva',
    slug: 'ashniva',
    type: 'OWN_GROUP',
    isServiceProvider: true,
    openTicketCount: 0,
  }),
  company(),
];

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  api = fakeApi({
    'GET /organizations': COMPANIES,
    'POST /organizations': company({ id: 'org-new', name: 'Beta Foods' }),
  });
  globalThis.fetch = api.fetch;
});

it('lists every company with its kind and open tickets, and opens one', async () => {
  signIn([PERMISSIONS.ORGANIZATION_MANAGE]);
  const onOpen = jest.fn();
  const view = await renderScreen(<CompaniesScreen onOpen={onOpen} />);

  expect(await view.findByText('Acme Retail')).toBeTruthy();
  expect(view.getByText('Service provider')).toBeTruthy();
  expect(view.getByText('3 open tickets')).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: 'Acme Retail' }));
  expect(onOpen).toHaveBeenCalledWith(company().id);
});

it('narrows by search and by kind', async () => {
  signIn([PERMISSIONS.ORGANIZATION_MANAGE]);
  const view = await renderScreen(<CompaniesScreen onOpen={jest.fn()} />);
  await view.findByText('Acme Retail');

  await fireEvent.changeText(view.getByLabelText('Search companies'), 'acme');
  expect(view.queryByRole('button', { name: 'Ashniva' })).toBeNull();
  expect(view.getByText('1 of 2 companies')).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText('Search companies'), '');
  await fireEvent.press(view.getByRole('button', { name: 'Own group company' }));
  expect(view.queryByRole('button', { name: 'Acme Retail' })).toBeNull();
  expect(view.getByRole('button', { name: 'Ashniva' })).toBeTruthy();
});

it('creates a company and opens it', async () => {
  signIn([PERMISSIONS.ORGANIZATION_MANAGE]);
  const onOpen = jest.fn();
  const view = await renderScreen(<CompaniesScreen onOpen={onOpen} />);
  await view.findByText('Acme Retail');

  await fireEvent.press(view.getByRole('button', { name: 'New company' }));
  await fireEvent.changeText(view.getByLabelText('Company name'), 'Beta Foods');
  await fireEvent.press(view.getByRole('button', { name: 'Create' }));

  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('org-new'));
  expect(api.find('POST', '/organizations')[0]?.body).toEqual({
    name: 'Beta Foods',
    type: 'CORPORATE_CUSTOMER',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  });
});

it('asks nothing of the API without organization:manage', async () => {
  signIn([PERMISSIONS.PROJECT_READ]);
  const view = await renderScreen(<CompaniesScreen onOpen={jest.fn()} />);

  expect(await view.findByText('Not available to you')).toBeTruthy();
  expect(api.find('GET', '/organizations')).toHaveLength(0);
});
