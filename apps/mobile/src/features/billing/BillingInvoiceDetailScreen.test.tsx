import { PERMISSIONS, REAUTH_HEADER, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import { CLIENT_ID, invoiceDetail, routeFetch, sentRequest } from './billing-test-data';
import { BillingInvoiceDetailScreen } from './BillingInvoiceDetailScreen';

/**
 * One invoice on the provider's side. Every action is gated on the permission its endpoint
 * checks, and the three guarded writes carry a fresh re-auth token.
 */

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

function render() {
  return renderScreen(<BillingInvoiceDetailScreen invoiceId="inv-1" onEdit={jest.fn()} />);
}

/** Presses the last button with this name — the sheet's confirm, not the bar's opener. */
async function pressLast(view: Awaited<ReturnType<typeof render>>, name: string) {
  const buttons = view.getAllByRole('button', { name });
  await fireEvent.press(buttons[buttons.length - 1]!);
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the lines, totals and the internal notes marked as internal', async () => {
  signInWith([]);
  routeFetch(fetchMock, { 'GET /invoices/inv-1': invoiceDetail() });
  const view = await render();

  expect(await view.findByText('Managed support — September')).toBeTruthy();
  expect(view.getAllByText('INR 1180.00').length).toBeGreaterThan(0);
  expect(view.getByText('CGST')).toBeTruthy();
  expect(view.queryByText('IGST')).toBeNull();
  expect(view.getByText('Internal notes — never shown to the client')).toBeTruthy();
  expect(view.getByText('Margin is thin on this one')).toBeTruthy();
});

it('offers no action to somebody who may only read invoices', async () => {
  signInWith([]);
  routeFetch(fetchMock, { 'GET /invoices/inv-1': invoiceDetail() });
  const view = await render();

  await view.findByText('Managed support — September');
  for (const name of ['Record payment', 'Void', 'Mark reminder sent', 'Issue invoice']) {
    expect(view.queryByRole('button', { name })).toBeNull();
  }
});

it('issues a draft after asking once', async () => {
  signInWith([PERMISSIONS.INVOICE_ISSUE, PERMISSIONS.INVOICE_WRITE]);
  routeFetch(fetchMock, {
    'POST /invoices/inv-1/issue': invoiceDetail(),
    'GET /invoices/inv-1': invoiceDetail({ status: 'DRAFT', pdfFileId: null }),
  });
  const view = await render();

  expect(await view.findByText('Draft invoice')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Edit draft' })).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Issue invoice' }));
  expect(sentRequest(fetchMock, '/invoices/inv-1/issue', 'POST')).toBeNull();

  await pressLast(view, 'Issue invoice');
  expect(sentRequest(fetchMock, '/invoices/inv-1/issue', 'POST')).not.toBeNull();
  await waitFor(() => expect(view.queryByText('Issue this invoice')).toBeNull());
});

it('cancels a draft with a reason and no password', async () => {
  signInWith([PERMISSIONS.INVOICE_CANCEL]);
  routeFetch(fetchMock, {
    'POST /invoices/inv-1/cancel': invoiceDetail({ status: 'CANCELLED' }),
    'GET /invoices/inv-1': invoiceDetail({ status: 'DRAFT' }),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('button', { name: 'Cancel draft' }));
  expect(view.queryByLabelText('Your password')).toBeNull();
  await fireEvent.changeText(view.getByLabelText('Reason'), '  Raised twice  ');
  await pressLast(view, 'Cancel draft');

  const cancel = sentRequest(fetchMock, '/invoices/inv-1/cancel', 'POST');
  expect(cancel?.body).toEqual({ reason: 'Raised twice' });
  expect(cancel?.headers[REAUTH_HEADER]).toBeUndefined();
  await waitFor(() => expect(view.queryByText('Cancel this draft')).toBeNull());
});

it('records a payment against the invoice, behind the password', async () => {
  signInWith([PERMISSIONS.PAYMENT_RECORD]);
  routeFetch(fetchMock, {
    'POST /auth/reauth': { reauthToken: 'reauth-1', expiresInSeconds: 300 },
    'POST /payments': { id: 'pay-1' },
    'GET /invoices/inv-1': invoiceDetail(),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('button', { name: 'Record payment' }));
  await fireEvent.changeText(view.getByLabelText('Reference'), 'NEFT-0031');
  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await pressLast(view, 'Record payment');

  expect(sentRequest(fetchMock, '/auth/reauth', 'POST')?.body).toEqual({
    password: 'correct horse',
  });
  const payment = sentRequest(fetchMock, '/payments', 'POST');
  expect(payment?.body).toMatchObject({
    clientOrganizationId: CLIENT_ID,
    reference: 'NEFT-0031',
    method: 'BANK_TRANSFER',
    amount: '1180.00',
    allocations: [{ invoiceId: 'inv-1', amount: '1180.00' }],
  });
  expect(payment?.headers[REAUTH_HEADER]).toBe('reauth-1');
  await waitFor(() => expect(view.queryByText('Record a payment')).toBeNull());
});

it('voids an issued invoice with a reason and the password', async () => {
  signInWith([PERMISSIONS.INVOICE_VOID]);
  routeFetch(fetchMock, {
    'POST /auth/reauth': { reauthToken: 'reauth-2', expiresInSeconds: 300 },
    'POST /invoices/inv-1/void': invoiceDetail({ status: 'VOID' }),
    'GET /invoices/inv-1': invoiceDetail(),
  });
  const view = await render();

  await fireEvent.press(await view.findByRole('button', { name: 'Void' }));
  await fireEvent.changeText(view.getByLabelText('Reason'), 'Wrong client');
  const confirm = view.getByRole('button', { name: 'Void invoice' });
  expect(confirm.props.accessibilityState.disabled).toBe(true);

  await fireEvent.changeText(view.getByLabelText('Your password'), 'correct horse');
  await fireEvent.press(view.getByRole('button', { name: 'Void invoice' }));

  const voided = sentRequest(fetchMock, '/invoices/inv-1/void', 'POST');
  expect(voided?.body).toEqual({ reason: 'Wrong client' });
  expect(voided?.headers[REAUTH_HEADER]).toBe('reauth-2');
  await waitFor(() => expect(view.queryByText('Void this invoice')).toBeNull());
});

it('does not offer a payment on an invoice with nothing owed', async () => {
  signInWith([PERMISSIONS.PAYMENT_RECORD, PERMISSIONS.INVOICE_WRITE]);
  routeFetch(fetchMock, {
    'GET /invoices/inv-1': invoiceDetail({
      status: 'PAID',
      amountPaid: '1180.00',
      balanceDue: '0.00',
    }),
  });
  const view = await render();

  expect((await view.findAllByText('Paid')).length).toBeGreaterThan(0);
  expect(view.queryByRole('button', { name: 'Record payment' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Mark reminder sent' })).toBeNull();
});
