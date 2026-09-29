import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import { invoiceSummary, page } from './billing-test-data';
import { BillingInvoicesScreen } from './BillingInvoicesScreen';

/**
 * The provider's invoice list: the web's views as chips, its server-side search, its count, and a
 * "New invoice" that only somebody who may write invoices is offered.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const ACCOUNTANT = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  permissions: [PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_WRITE],
});

function listQueries(): URLSearchParams[] {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/invoices'))
    .map((url) => new URLSearchParams(url.split('?')[1] ?? ''));
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: ACCOUNTANT });
});

it('opens on the outstanding invoices, with the amount, status and count', async () => {
  fetchMock.mockResolvedValue(
    jsonResponse(
      page([
        invoiceSummary({ status: 'PARTIALLY_PAID', amountPaid: '1000.00', balanceDue: '180.00' }),
      ]),
    ),
  );
  const onOpen = jest.fn();
  const view = await renderScreen(<BillingInvoicesScreen onOpen={onOpen} onCreate={jest.fn()} />);

  expect(await view.findByText('INR 1180.00')).toBeTruthy();
  expect(view.getByText('Partially paid')).toBeTruthy();
  expect(view.getByText('Outstanding INR 180.00')).toBeTruthy();
  expect(view.getByText('1 in this view')).toBeTruthy();
  expect(listQueries()[0]?.get('status')).toBe('ISSUED,PARTIALLY_PAID,OVERDUE');

  await fireEvent.press(view.getByRole('button', { name: /INV\/2026-27\/0007, Northwind/ }));
  expect(onOpen).toHaveBeenCalledWith('inv-1');
});

it('asks the server for drafts when the Drafts view is chosen, and names a draft as one', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    jsonResponse(page(url.includes('status=DRAFT') ? [invoiceSummary({ status: 'DRAFT' })] : [])),
  );
  const view = await renderScreen(
    <BillingInvoicesScreen onOpen={jest.fn()} onCreate={jest.fn()} />,
  );

  await fireEvent.press(await view.findByRole('radio', { name: 'Drafts' }));
  expect(await view.findByText(/Draft invoice · Northwind/)).toBeTruthy();
  expect(listQueries().some((query) => query.get('status') === 'DRAFT')).toBe(true);
});

it('offers New invoice to somebody who may write invoices', async () => {
  fetchMock.mockResolvedValue(jsonResponse(page([])));
  const onCreate = jest.fn();
  const view = await renderScreen(<BillingInvoicesScreen onOpen={jest.fn()} onCreate={onCreate} />);

  await fireEvent.press(await view.findByRole('button', { name: 'New invoice' }));
  expect(onCreate).toHaveBeenCalled();
});

it('does not offer New invoice to somebody who may only read them', async () => {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ permissions: [PERMISSIONS.INVOICE_READ] }),
  });
  fetchMock.mockResolvedValue(jsonResponse(page([])));
  const view = await renderScreen(
    <BillingInvoicesScreen onOpen={jest.fn()} onCreate={jest.fn()} />,
  );

  expect(await view.findByText('No invoices')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'New invoice' })).toBeNull();
});

it('shows the API’s sentence when the list cannot be read', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ message: 'Forbidden resource' }, 403));
  const view = await renderScreen(
    <BillingInvoicesScreen onOpen={jest.fn()} onCreate={jest.fn()} />,
  );

  expect(await view.findByText('Forbidden resource')).toBeTruthy();
});
