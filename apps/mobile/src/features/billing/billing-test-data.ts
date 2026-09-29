import type {
  BillingProfile,
  InvoiceDetail,
  InvoiceSummary,
  PaginatedResponse,
  PaymentSummary,
} from '@ashniva/types';

import { jsonResponse } from '../../shared/testing/harness';

/** Fixtures for the billing screen tests. Imported only by tests. */

export const CLIENT_ID = '33333333-3333-4333-8333-333333333333';

export function invoiceSummary(overrides: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: 'inv-1',
    numberLabel: 'INV/2026-27/0007',
    financialYear: '2026-27',
    status: 'ISSUED',
    clientOrganizationId: CLIENT_ID,
    clientName: 'Northwind',
    projectId: null,
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    currency: 'INR',
    isOverdue: false,
    updatedAt: '2026-09-01T09:00:00.000Z',
    subtotal: '1000.00',
    discountTotal: '0.00',
    taxableValue: '1000.00',
    cgstTotal: '90.00',
    sgstTotal: '90.00',
    igstTotal: '0.00',
    taxTotal: '180.00',
    roundingAdjustment: '0.00',
    total: '1180.00',
    amountPaid: '0.00',
    balanceDue: '1180.00',
    ...overrides,
  };
}

export function invoiceDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    ...invoiceSummary(),
    contractId: null,
    milestoneId: null,
    changeRequestId: null,
    placeOfSupplyState: 'Karnataka',
    placeOfSupplyCode: '29',
    supplyType: 'INTRA_STATE',
    taxTreatment: 'EXCLUSIVE',
    reverseCharge: false,
    amountInWords: 'Rupees One Thousand One Hundred Eighty Only',
    notes: 'Thank you for your business.',
    internalNotes: 'Margin is thin on this one',
    pdfFileId: 'file-1',
    issuedAt: '2026-09-01T09:00:00.000Z',
    cancelReason: null,
    voidReason: null,
    lastReminderAt: null,
    lineItems: [
      {
        id: 'line-1',
        position: 1,
        description: 'Managed support — September',
        hsnSac: '998314',
        quantity: '1.000',
        unit: 'Nos',
        unitPrice: '1000.00',
        discountPercent: '0.00',
        discountAmount: '0.00',
        taxRate: '18.00',
        taxableValue: '1000.00',
        cgstAmount: '90.00',
        sgstAmount: '90.00',
        igstAmount: '0.00',
        lineTotal: '1180.00',
        source: 'MANUAL',
      },
    ],
    taxBreakdown: [],
    payments: [],
    history: [],
    createdAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

export function paymentSummary(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    id: 'pay-1',
    reference: 'NEFT-0031',
    method: 'BANK_TRANSFER',
    paidAt: '2026-09-10T00:00:00.000Z',
    amount: '1180.00',
    unallocatedAmount: '0.00',
    currency: 'INR',
    clientOrganizationId: CLIENT_ID,
    clientName: 'Northwind',
    notes: null,
    recordedByName: 'Priya Rao',
    createdAt: '2026-09-10T09:00:00.000Z',
    ...overrides,
  };
}

export function billingProfile(overrides: Partial<BillingProfile> = {}): BillingProfile {
  return {
    legalName: 'Ashniva Technologies Pvt Ltd',
    addressLine1: '12 MG Road',
    addressLine2: null,
    city: 'Bengaluru',
    state: 'Karnataka',
    stateCode: '29',
    postalCode: '560001',
    country: 'India',
    gstin: '29AABCU9603R1ZM',
    pan: null,
    email: 'billing@ashniva.example',
    phone: null,
    currency: 'INR',
    paymentTermsDays: 30,
    defaultTaxRate: '18.00',
    defaultTaxTreatment: 'EXCLUSIVE',
    roundTotals: true,
    invoicePrefix: 'INV',
    nextSequence: 8,
    sequenceYear: '2026-27',
    financialYearStartMonth: 4,
    logoFileId: null,
    signatureFileId: null,
    bankDetails: 'HDFC Bank · A/C 50200012345678',
    terms: null,
    internalNotes: null,
    ...overrides,
  };
}

export function page<T>(items: T[]): PaginatedResponse<T> {
  return { items, nextCursor: null, total: items.length };
}

/**
 * A fetch double that answers by method and path. Keys are `METHOD /path`; the first key whose
 * path the request URL contains (query string ignored) wins, so list the specific ones first.
 */
export function routeFetch(fetchMock: jest.Mock, routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path =
      String(url)
        .replace(/^https?:\/\/[^/]+/, '')
        .split('?')[0] ?? '';
    for (const [key, body] of Object.entries(routes)) {
      const [routeMethod, routePath] = key.split(' ');
      if (routeMethod === method && routePath && path.endsWith(routePath)) {
        return jsonResponse(body);
      }
    }
    return jsonResponse({ message: `No route for ${method} ${path}` }, 404);
  });
}

/** The first request to a path ending in `suffix` with `method`, or null if none was sent. */
export function sentRequest(
  fetchMock: jest.Mock,
  suffix: string,
  method: string,
): { body: unknown; headers: Record<string, string> } | null {
  const call = fetchMock.mock.calls.find(
    ([url, init]) =>
      String(url).split('?')[0]?.endsWith(suffix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  );
  if (!call) {
    return null;
  }
  const init = call[1] as RequestInit;
  return {
    body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    headers: (init.headers ?? {}) as Record<string, string>,
  };
}
