import { PERMISSIONS, REAUTH_HEADER, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { CLIENT_ID, page, paymentSummary, routeFetch, sentRequest } from './billing-test-data';
import { PaymentsScreen } from './PaymentsScreen';

/** Money received, and a payment recorded for a client rather than against one invoice. */

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
    user: sessionUser({ permissions: [PERMISSIONS.PAYMENT_READ, ...permissions] }),
  });
}

function routes() {
  routeFetch(fetchMock, {
    'GET /organizations/options': [{ id: CLIENT_ID, name: 'Northwind', isServiceProvider: false }],
    'GET /payments': page([paymentSummary({ unallocatedAmount: '180.00' })]),
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    'POST /payments': paymentSummary({ id: 'pay-2' }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('lists payments with what is still unapplied, and no record button without the permission', async () => {
  signInWith([]);
  routes();
  const view = await renderScreen(<PaymentsScreen />);

  expect(await view.findByText('INR 1180.00')).toBeTruthy();
  expect(view.getByText('180.00 unapplied')).toBeTruthy();
  expect(view.getByText('1 recorded')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Record payment' })).toBeNull();
});

it('records a payment kept as credit, behind the password', async () => {
  signInWith([PERMISSIONS.PAYMENT_RECORD]);
  routes();
  const view = await renderScreen(<PaymentsScreen />);

  await fireEvent.press(await view.findByRole('button', { name: 'Record payment' }));
  await fireEvent.press(view.getByRole('button', { name: 'Received from: not set' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'Northwind' }));
  await fireEvent.changeText(view.getByLabelText('Reference'), 'UPI-778');
  await fireEvent.changeText(view.getByLabelText('Amount'), '500.00');
  await fireEvent(view.getByLabelText('Keep as credit'), 'valueChange', true);
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  const buttons = view.getAllByRole('button', { name: 'Record payment' });
  await fireEvent.press(buttons[buttons.length - 1]!);

  const payment = sentRequest(fetchMock, '/payments', 'POST');
  expect(payment?.body).toMatchObject({
    clientOrganizationId: CLIENT_ID,
    reference: 'UPI-778',
    amount: '500.00',
    leaveUnallocated: true,
  });
  expect((payment?.body as { allocations?: unknown }).allocations).toBeUndefined();
  expect(payment?.headers[REAUTH_HEADER]).toBe('reauth-1');
  expect(await view.findByText('Payment recorded')).toBeTruthy();
  await waitFor(() => expect(view.queryByText('Record a payment')).toBeNull());
});
