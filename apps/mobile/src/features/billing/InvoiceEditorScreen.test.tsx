import { PERMISSIONS, type CalculationPreview } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../shared/testing/harness';
import {
  billingProfile,
  CLIENT_ID,
  invoiceDetail,
  routeFetch,
  sentRequest,
} from './billing-test-data';
import { InvoiceEditorScreen } from './InvoiceEditorScreen';

/**
 * Raising an invoice on the phone: the client, a place of supply taken from the client's recorded
 * bill-to address, a line added through its sheet, the server's preview, and the draft saved.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const PREVIEW: CalculationPreview = {
  subtotal: '1000.00',
  discountTotal: '0.00',
  taxableValue: '1000.00',
  cgstTotal: '0.00',
  sgstTotal: '0.00',
  igstTotal: '180.00',
  taxTotal: '180.00',
  roundingAdjustment: '0.00',
  total: '1180.00',
  lines: [],
  taxBreakdown: [],
  amountInWords: 'Rupees One Thousand One Hundred Eighty Only',
};

const CLIENT_BILL_TO = {
  clientOrganizationId: CLIENT_ID,
  clientName: 'Northwind',
  legalName: 'Northwind Traders LLP',
  addressLine1: '1 Marine Drive',
  addressLine2: null,
  city: 'Mumbai',
  state: 'Maharashtra',
  stateCode: '27',
  postalCode: '400001',
  country: 'India',
  gstin: null,
  updatedAt: '2026-09-01T09:00:00.000Z',
};

function routes(profile: unknown = billingProfile()) {
  routeFetch(fetchMock, {
    'GET /settings/billing/clients': [CLIENT_BILL_TO],
    'GET /settings/billing': profile,
    'GET /organizations/options': [
      { id: CLIENT_ID, name: 'Northwind', isServiceProvider: false },
      { id: 'self', name: 'Ashniva', isServiceProvider: true },
    ],
    'POST /invoices/calculate': PREVIEW,
    'POST /invoices': invoiceDetail({ id: 'inv-9', status: 'DRAFT' }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ permissions: [PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_WRITE] }),
  });
});

it('creates a draft with the client, place of supply and line that were entered', async () => {
  routes();
  const onSaved = jest.fn();
  const view = await renderScreen(
    <InvoiceEditorScreen invoiceId={null} onSaved={onSaved} onOpenSettings={jest.fn()} />,
  );

  await fireEvent.press(await view.findByRole('button', { name: 'Client: not set' }));
  await fireEvent.press(await view.findByRole('radio', { name: 'Northwind' }));
  expect(view.getByLabelText('State').props.value).toBe('Maharashtra');
  expect(view.getByLabelText('State code').props.value).toBe('27');

  const save = view.getByRole('button', { name: 'Save draft' });
  expect(save.props.accessibilityState.disabled).toBe(true);
  expect(view.getByText('Add at least one line')).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: 'Add line' }));
  await fireEvent.changeText(view.getByLabelText('Description'), 'Managed support — September');
  await fireEvent.changeText(view.getByLabelText('HSN/SAC'), '998314');
  await fireEvent.changeText(view.getByLabelText('Unit price'), '1000');
  const addButtons = view.getAllByRole('button', { name: 'Add line' });
  await fireEvent.press(addButtons[addButtons.length - 1]!);

  expect(await view.findByText('INR 1180.00', {}, { timeout: 3000 })).toBeTruthy();
  expect(sentRequest(fetchMock, '/invoices/calculate', 'POST')?.body).toMatchObject({
    placeOfSupplyCode: '27',
    taxTreatment: 'EXCLUSIVE',
    reverseCharge: false,
  });

  await fireEvent.changeText(view.getByLabelText('Internal notes'), '  Chase before Diwali  ');
  await fireEvent.press(view.getByRole('button', { name: 'Save draft' }));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(onSaved.mock.calls[0]?.[1]).toBe(true);
  expect(sentRequest(fetchMock, '/invoices', 'POST')?.body).toEqual({
    clientOrganizationId: CLIENT_ID,
    issueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    placeOfSupplyState: 'Maharashtra',
    placeOfSupplyCode: '27',
    taxTreatment: 'EXCLUSIVE',
    reverseCharge: false,
    internalNotes: 'Chase before Diwali',
    lines: [
      {
        description: 'Managed support — September',
        hsnSac: '998314',
        quantity: '1',
        unit: 'Nos',
        unitPrice: '1000',
        taxRate: '18.00',
      },
    ],
  });
});

it('points at the billing settings when the provider has no billing profile yet', async () => {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      permissions: [
        PERMISSIONS.INVOICE_READ,
        PERMISSIONS.INVOICE_WRITE,
        PERMISSIONS.BILLING_PROFILE_MANAGE,
      ],
    }),
  });
  routes(null);
  const onOpenSettings = jest.fn();
  const view = await renderScreen(
    <InvoiceEditorScreen invoiceId={null} onSaved={jest.fn()} onOpenSettings={onOpenSettings} />,
  );

  expect(await view.findByText('Set up billing first')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(
    true,
  );
  await fireEvent.press(view.getByRole('button', { name: 'Open billing settings' }));
  expect(onOpenSettings).toHaveBeenCalled();
});

it('refuses to edit an invoice that has been issued', async () => {
  routeFetch(fetchMock, {
    'GET /settings/billing/clients': [],
    'GET /settings/billing': billingProfile(),
    'GET /invoices/inv-1': invoiceDetail(),
  });
  const view = await renderScreen(
    <InvoiceEditorScreen invoiceId="inv-1" onSaved={jest.fn()} onOpenSettings={jest.fn()} />,
  );

  expect(await view.findByText('Only a draft can be edited')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Save changes' })).toBeNull();
});
