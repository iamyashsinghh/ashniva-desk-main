import { PERMISSIONS, REAUTH_HEADER, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { billingProfile, CLIENT_ID, routeFetch, sentRequest } from './billing-test-data';
import { BillingSettingsScreen } from './BillingSettingsScreen';

/** The provider's billing profile and client bill-to details, each saved behind the password. */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

function signInWith(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ permissions: [PERMISSIONS.INVOICE_READ, ...permissions] }),
  });
}

function routes() {
  routeFetch(fetchMock, {
    'GET /settings/billing/clients': [],
    'GET /settings/billing': billingProfile(),
    'GET /organizations/options': [{ id: CLIENT_ID, name: 'Northwind', isServiceProvider: false }],
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    [`PUT /settings/billing/clients/${CLIENT_ID}`]: {},
    'PUT /settings/billing': billingProfile(),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('saves the profile with the re-auth token, and shows the next number', async () => {
  signInWith([PERMISSIONS.BILLING_PROFILE_MANAGE]);
  routes();
  const view = await renderScreen(<BillingSettingsScreen />);

  expect(await view.findByText(/Next invoice number: INV\/2026-27\/0008/)).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('Terms'), '  Payable within 30 days  ');
  await fireEvent.press(view.getByRole('button', { name: 'Save billing details' }));
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));

  const put = sentRequest(fetchMock, '/settings/billing', 'PUT');
  expect(put?.body).toMatchObject({
    legalName: 'Ashniva Technologies Pvt Ltd',
    stateCode: '29',
    terms: 'Payable within 30 days',
    paymentTermsDays: 30,
    financialYearStartMonth: 4,
  });
  expect(put?.headers[REAUTH_HEADER]).toBe('reauth-1');
  expect(await view.findByText('Billing details saved')).toBeTruthy();
});

it('saves a client’s bill-to details behind the password', async () => {
  signInWith([PERMISSIONS.BILLING_PROFILE_MANAGE]);
  routes();
  const view = await renderScreen(<BillingSettingsScreen />);

  await fireEvent.press(await view.findByRole('button', { name: 'Client: not set' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'Northwind, Not recorded yet' }));
  await fireEvent.changeText(view.getByLabelText('Registered name'), 'Northwind Traders LLP');
  await fireEvent.changeText(view.getByLabelText('Client address line 1'), '1 Marine Drive');
  await fireEvent.changeText(view.getByLabelText('Client state code'), '27');
  await fireEvent.press(view.getByRole('button', { name: 'Save client billing details' }));
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(sentRequest(fetchMock, `/settings/billing/clients/${CLIENT_ID}`, 'PUT')).not.toBeNull(),
  );
  const put = sentRequest(fetchMock, `/settings/billing/clients/${CLIENT_ID}`, 'PUT');
  expect(put?.body).toMatchObject({
    legalName: 'Northwind Traders LLP',
    addressLine1: '1 Marine Drive',
    stateCode: '27',
    country: 'India',
  });
  expect(put?.headers[REAUTH_HEADER]).toBe('reauth-1');
  expect(await view.findByText('Billing details for this client saved')).toBeTruthy();
});

it('is read only without the billing profile permission', async () => {
  signInWith([]);
  routes();
  const view = await renderScreen(<BillingSettingsScreen />);

  expect(await view.findByText('Read only')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Save billing details' })).toBeNull();
  expect(view.getByLabelText('Legal business name').props.editable).toBe(false);
});
